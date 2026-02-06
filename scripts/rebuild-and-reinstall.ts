/**
 * Rebuild a "dirty" VPS with Debian 12 + SSH key, then install OpenClaw
 * with Caddy HTTPS — producing a working OpenClaw web UI.
 *
 * Uses the same service functions as the production deploy flow.
 *
 * Usage:
 *   npx tsx scripts/rebuild-and-reinstall.ts <ip> <hostname> <ssh-private-key-path> [ovh-service-name]
 *
 * Example:
 *   npx tsx scripts/rebuild-and-reinstall.ts 40.160.250.135 vps-4cb9ae84.vps.ovh.us .e2e-keys/openclaw-e2e-1770356113465
 *
 * The OVH service name defaults to the hostname (which is {serviceName}.vps.ovh.us).
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client: SshClient, utils: sshUtils } = require('ssh2');

import * as ovhService from '../src/services/ovh.service.js';
import * as openRouterService from '../src/services/openrouter.service.js';

// ============================================================
// Constants
// ============================================================

const REBUILD_IMAGE_NAME = 'Debian 12';
const SSH_USERNAMES = ['debian', 'root'];
const OPENCLAW_PORT = 18789;

// ============================================================
// Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sshExec(
  host: string,
  username: string,
  privateKey: string,
  command: string,
  timeoutMs = 10 * 60_000
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        stream.on('close', (code: number) => {
          clearTimeout(timer);
          conn.end();
          resolve({ stdout, stderr, code: code || 0 });
        });
        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      });
    });

    conn.on('error', (err: any) => { clearTimeout(timer); reject(err); });

    conn.connect({
      host,
      port: 22,
      username,
      privateKey,
      readyTimeout: 30_000,
      algorithms: {
        serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
      },
    });
  });
}

function buildSetupScript(openRouterApiKey: string, hostname: string): string {
  return `sudo bash <<'SETUPSCRIPT'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "=== [1/8] System update ==="
apt-get update -qq
apt-get install -y -qq curl caddy ufw python3

echo "=== [2/8] Running OpenClaw installer ==="
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard

echo "=== [3/8] Installing Vincent agent wallet skill ==="
npx --yes clawhub@latest install agentwallet || true

echo "=== [4/8] Running OpenClaw onboard ==="
openclaw onboard \
  --non-interactive \
  --accept-risk \
  --mode local \
  --auth-choice openrouter-api-key \
  --openrouter-api-key '${openRouterApiKey}' \
  --gateway-bind loopback \
  --skip-channels \
  --skip-skills \
  --skip-health \
  --skip-ui \
  --skip-daemon

echo "=== [5/8] Configuring OpenClaw ==="
openclaw config set agents.defaults.model --json '{"primary": "openrouter/google/gemini-3-flash-preview"}'
openclaw config set gateway.controlUi.allowInsecureAuth true
openclaw config set gateway.trustedProxies --json '["127.0.0.1/32", "::1/128"]'

echo "=== [6/8] Configuring Caddy reverse proxy (HTTPS via ${hostname}) ==="
cat > /etc/caddy/Caddyfile << CADDYEOF
${hostname} {
    reverse_proxy localhost:${OPENCLAW_PORT}
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy

echo "=== [7/8] Configuring firewall ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== [8/8] Starting OpenClaw gateway ==="
OPENCLAW_BIN=$(which openclaw)
echo "OpenClaw binary: \${OPENCLAW_BIN}"

cat > /etc/systemd/system/openclaw-gateway.service << UNIT
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
ExecStart=\${OPENCLAW_BIN} gateway run
Restart=always
RestartSec=5
Environment=NODE_ENV=production
WorkingDirectory=/root

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable openclaw-gateway
systemctl stop openclaw-gateway 2>/dev/null || true
systemctl start openclaw-gateway

sleep 10

ACCESS_TOKEN=$(openclaw config get gateway.auth.token 2>/dev/null || echo "")
echo "OPENCLAW_ACCESS_TOKEN=\${ACCESS_TOKEN}"

echo "=== Setup complete ==="
SETUPSCRIPT`;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const [ip, hostname, keyPath, serviceNameArg] = process.argv.slice(2);

  if (!ip || !hostname || !keyPath) {
    console.error('Usage: npx tsx scripts/rebuild-and-reinstall.ts <ip> <hostname> <ssh-private-key-path> [ovh-service-name]');
    console.error('Example: npx tsx scripts/rebuild-and-reinstall.ts 40.160.250.135 vps-4cb9ae84.vps.ovh.us .e2e-keys/openclaw-e2e-1770356113465');
    process.exit(1);
  }

  // OVH service name IS the full hostname (e.g. vps-4cb9ae84.vps.ovh.us)
  const serviceName = serviceNameArg || hostname;
  console.log(`\n=== Rebuild & Reinstall ===`);
  console.log(`  IP:           ${ip}`);
  console.log(`  Hostname:     ${hostname}`);
  console.log(`  Service:      ${serviceName}`);
  console.log(`  Key file:     ${keyPath}`);

  // Step 1: Read SSH key pair
  console.log('\n[1/7] Reading SSH private key...');
  const sshPriv = readFileSync(keyPath, 'utf-8');

  // Derive public key from private key
  const parsed = sshUtils.parseKey(sshPriv);
  if (!parsed || parsed instanceof Error) {
    throw new Error(`Failed to parse SSH private key from ${keyPath}`);
  }
  const keyObj = Array.isArray(parsed) ? parsed[0] : parsed;
  const sshPub = keyObj.getPublicSSH
    ? `ssh-rsa ${keyObj.getPublicSSH().toString('base64')} openclaw-rebuild`
    : (() => { throw new Error('Cannot derive public key from private key'); })();
  console.log(`  Public key: ${sshPub.slice(0, 60)}...`);

  // Step 2: Find rebuild image
  console.log('\n[2/7] Finding Debian 12 image...');
  const imageIds = await ovhService.getAvailableImages(serviceName);
  let rebuildImageId: string | null = null;
  for (const imgId of imageIds) {
    try {
      const img = await ovhService.getImageDetails(serviceName, imgId);
      if (img.name === REBUILD_IMAGE_NAME) {
        rebuildImageId = imgId;
        console.log(`  Found: ${img.name} (${imgId})`);
        break;
      }
    } catch {}
  }
  if (!rebuildImageId) {
    if (imageIds.length === 0) throw new Error('No rebuild images available');
    rebuildImageId = imageIds[0];
    console.log(`  "${REBUILD_IMAGE_NAME}" not found, using first: ${rebuildImageId}`);
  }

  // Step 3: Rebuild VPS
  console.log('\n[3/7] Rebuilding VPS with SSH key...');
  const rebuildResult = await ovhService.rebuildVps(serviceName, rebuildImageId, sshPub);
  console.log(`  Rebuild initiated (task: ${rebuildResult.id}, state: ${rebuildResult.state})`);

  // Step 4: Wait for rebuild
  console.log('\n[4/7] Waiting for VPS rebuild...');
  let wasInstalling = false;
  for (let i = 0; i < 30; i++) {
    await sleep(15_000);
    try {
      const details = await ovhService.getVpsDetails(serviceName);
      console.log(`  [${(i + 1) * 15}s] State: ${details.state}`);
      if (details.state === 'installing') wasInstalling = true;
      if (details.state === 'running' && wasInstalling) {
        console.log('  Rebuild complete. Waiting 30s for SSH to come up...');
        await sleep(30_000);
        break;
      }
    } catch (e: any) {
      console.log(`  [${(i + 1) * 15}s] ${e.message || 'error'}`);
    }
  }

  // Step 5: Wait for SSH and identify user
  console.log('\n[5/7] Connecting via SSH...');
  let sshUser: string | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    for (const username of SSH_USERNAMES) {
      try {
        const res = await sshExec(ip, username, sshPriv, 'echo ok', 15_000);
        if (res.stdout.includes('ok')) {
          sshUser = username;
          console.log(`  SSH connected as ${username}`);
          break;
        }
      } catch {}
    }
    if (sshUser) break;
    console.log(`  Attempt ${attempt + 1}/10 — retrying in 15s...`);
    await sleep(15_000);
  }
  if (!sshUser) throw new Error('SSH not available after rebuild');

  // Step 6: Provision OpenRouter key & run setup
  console.log('\n[6/7] Provisioning OpenRouter key & running setup...');
  const orKey = await openRouterService.createKey(`openclaw-rebuild-${Date.now()}`, {
    limit: 10,
    limit_reset: 'monthly',
  });
  console.log(`  OpenRouter key created (hash: ${orKey.hash})`);

  const setupScript = buildSetupScript(orKey.key, hostname);
  console.log('  Running setup script (this takes a few minutes)...');
  const result = await sshExec(ip, sshUser, sshPriv, setupScript, 15 * 60_000);
  console.log(`  Exit code: ${result.code}`);

  if (result.code !== 0) {
    console.error('\n=== SETUP FAILED ===');
    console.error('STDOUT (last 2000 chars):');
    console.error(result.stdout.slice(-2000));
    console.error('\nSTDERR (last 1000 chars):');
    console.error(result.stderr.slice(-1000));
    process.exit(1);
  }

  // Extract access token
  const tokenMatch = result.stdout.match(/OPENCLAW_ACCESS_TOKEN=(.*)/);
  const accessToken = tokenMatch?.[1]?.trim() || '';
  console.log(`  Access token: ${accessToken ? accessToken.slice(0, 12) + '...' : '(empty)'}`);

  // Step 7: Health check
  console.log('\n[7/7] Waiting for HTTPS health check...');
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    // Try HTTPS on hostname
    try {
      const res = await fetch(`https://${hostname}`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok || res.status === 401 || res.status === 403) {
        healthy = true;
        console.log(`  HTTPS healthy! (status ${res.status})`);
        break;
      }
    } catch {}

    // Fallback: direct gateway port
    try {
      const res = await fetch(`http://${ip}:${OPENCLAW_PORT}`, { signal: AbortSignal.timeout(5_000) });
      if (res.ok || res.status === 401 || res.status === 403) {
        healthy = true;
        console.log(`  Gateway healthy on port ${OPENCLAW_PORT} (status ${res.status}), HTTPS may still be provisioning cert`);
        break;
      }
    } catch {}

    console.log(`  Attempt ${i + 1}/30 — retrying in 10s...`);
    await sleep(10_000);
  }

  // Summary
  console.log('\n========================================');
  if (healthy) {
    console.log('  SUCCESS — OpenClaw is live!');
  } else {
    console.log('  WARNING — Health check timed out, but setup completed');
  }
  console.log(`  HTTPS URL:  https://${hostname}`);
  if (accessToken) {
    console.log(`  With token: https://${hostname}?token=${accessToken}`);
  }
  console.log(`  SSH:        ssh -i ${keyPath} ${sshUser}@${ip}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
