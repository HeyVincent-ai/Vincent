/**
 * OpenClaw Deploy Orchestration Service
 *
 * Manages the full lifecycle of OpenClaw VPS deployments:
 * 1. Generate SSH key pair (RSA 4096 — OVH doesn't support ed25519)
 * 2. Provision OpenRouter API key
 * 3. Find available VPS plan + datacenter
 * 4. Order VPS from OVH
 * 5. Poll until VPS is delivered
 * 6. Rebuild VPS with SSH key (publicSshKey + doNotSendPassword)
 * 7. SSH into VPS and run setup script
 * 8. Extract access token from OpenClaw config
 * 9. Poll health endpoint until ready
 *
 * Key learnings from real VPS testing:
 * - OVH /me/sshKey does NOT support ed25519. Must use RSA.
 * - publicSshKey (raw content) + doNotSendPassword: true is the ONLY
 *   working combination for SSH key injection via rebuild.
 * - The SSH key is injected for the non-root user (e.g., "debian" for
 *   Debian 12). Root does NOT get the key.
 * - ssh2 library does not support Node crypto's PKCS8 format — use
 *   ssh2's own utils.generateKeyPairSync.
 * - getVpsIps() is more reliable than getVpsDetails().ips.
 * - openclaw binary installs to /usr/bin/openclaw (not /usr/local/bin).
 * - `gateway start` requires systemd user services (unavailable on
 *   minimal VPS images). Use `gateway run` (foreground) with a system
 *   systemd service instead.
 * - Top-level "model" key is invalid in openclaw.json. The correct path
 *   is agents.defaults.model = { primary: "provider/model" }.
 * - Use `openclaw setup --non-interactive --mode local` to bootstrap
 *   config, then `openclaw config set` for schema-validated changes.
 * - Caddy 2.6 (Debian 12 package) does not support TLS for bare IPs.
 *   Use HTTP (port 80) reverse proxy instead.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client: SshClient, utils: sshUtils } = require('ssh2');

import prisma from '../db/client.js';
import * as ovhService from './ovh.service.js';
import * as openRouterService from './openrouter.service.js';
import type { OpenClawDeployment, OpenClawStatus } from '@prisma/client';

// ============================================================
// Constants
// ============================================================

// Plans to try in priority order
const VPS_PLANS_PRIORITY = [
  'vps-2025-model1.LZ',
  'vps-2025-model1-ca',
  'vps-2025-model1',
  'vps-2025-model2-ca',
  'vps-2025-model3-ca',
  'vps-2025-model2',
  'vps-2025-model3',
];

const DEFAULT_OS = 'Debian 12';
const REBUILD_IMAGE_NAME = 'Debian 12';
const SSH_USERNAME = 'debian'; // Debian 12 default user
const OPENCLAW_PORT = 18789;

// Polling intervals
const ORDER_POLL_INTERVAL_MS = 30_000;       // 30s
const ORDER_POLL_TIMEOUT_MS = 20 * 60_000;   // 20 min
const REBUILD_POLL_INTERVAL_MS = 15_000;     // 15s
const REBUILD_POLL_TIMEOUT_MS = 5 * 60_000;  // 5 min
const SSH_RETRY_INTERVAL_MS = 15_000;        // 15s
const SSH_RETRY_TIMEOUT_MS = 5 * 60_000;     // 5 min
const HEALTH_POLL_INTERVAL_MS = 10_000;      // 10s
const HEALTH_POLL_TIMEOUT_MS = 10 * 60_000;  // 10 min
const IP_POLL_INTERVAL_MS = 15_000;          // 15s
const IP_POLL_TIMEOUT_MS = 3 * 60_000;       // 3 min

// ============================================================
// Types
// ============================================================

export interface DeployOptions {
  planCode?: string;
  datacenter?: string;
  os?: string;
}

// ============================================================
// Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate an RSA 4096 SSH key pair using ssh2's built-in utility.
 * OVH /me/sshKey does NOT support ed25519. ssh2 does not support
 * Node crypto's PKCS8 format. This is the only working combination.
 */
function generateSshKeyPair(): { publicKey: string; privateKey: string } {
  const keys = sshUtils.generateKeyPairSync('rsa', {
    bits: 4096,
    comment: 'openclaw-deploy',
  });
  return { publicKey: keys.public, privateKey: keys.private };
}

async function updateDeployment(
  id: string,
  data: {
    status?: OpenClawStatus;
    statusMessage?: string;
    provisionLog?: string;
    ipAddress?: string;
    accessToken?: string;
    ovhServiceName?: string;
    ovhOrderId?: string;
    ovhCartId?: string;
    sshPrivateKey?: string;
    sshPublicKey?: string;
    openRouterKeyHash?: string;
    readyAt?: Date;
    destroyedAt?: Date;
  }
): Promise<OpenClawDeployment> {
  return prisma.openClawDeployment.update({
    where: { id },
    data,
  });
}

function appendLog(existingLog: string | null, message: string): string {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  return existingLog ? `${existingLog}\n${line}` : line;
}

// ============================================================
// SSH Execution
// ============================================================

/**
 * Execute a command on the VPS via SSH.
 * Uses the non-root user (debian) since OVH injects keys there.
 */
function sshExec(
  host: string,
  username: string,
  privateKey: string,
  command: string,
  timeoutMs: number = 10 * 60_000
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
        if (err) {
          clearTimeout(timer);
          conn.end();
          return reject(err);
        }

        stream.on('close', (code: number) => {
          clearTimeout(timer);
          conn.end();
          resolve({ stdout, stderr, code: code || 0 });
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    conn.on('error', (err: any) => {
      clearTimeout(timer);
      reject(err);
    });

    conn.connect({
      host,
      port: 22,
      username,
      privateKey,
      readyTimeout: 30_000,
      algorithms: {
        serverHostKey: [
          'ssh-ed25519',
          'ecdsa-sha2-nistp256',
          'rsa-sha2-512',
          'rsa-sha2-256',
          'ssh-rsa',
        ],
      },
    });
  });
}

/**
 * Wait for SSH to become available on the VPS.
 * Tries debian first (Debian 12), then root as fallback.
 */
async function waitForSsh(
  host: string,
  privateKey: string,
  timeoutMs: number = SSH_RETRY_TIMEOUT_MS
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const usernames = [SSH_USERNAME, 'root'];

  while (Date.now() < deadline) {
    for (const username of usernames) {
      try {
        const result = await sshExec(host, username, privateKey, 'echo ok', 15_000);
        if (result.stdout.includes('ok')) return username;
      } catch {
        // SSH not ready yet
      }
    }
    await sleep(SSH_RETRY_INTERVAL_MS);
  }

  throw new Error(`SSH not available on ${host} after ${timeoutMs}ms`);
}

// ============================================================
// VPS Setup Script
// ============================================================

function buildSetupScript(openRouterApiKey: string, _vpsIp: string): string {
  // Run as root via sudo. The SSH user is debian (non-root).
  // Key learnings from real VPS testing:
  // - openclaw binary installs to /usr/bin/openclaw (not /usr/local/bin)
  // - `gateway start` uses systemd user services which aren't available on
  //   minimal VPS images. Must use `gateway run` (foreground) with a system
  //   systemd service.
  // - Top-level "model" is not a valid config key. Use openclaw config set
  //   with agents.defaults.model (object with "primary" field).
  // - Use `openclaw setup --non-interactive --mode local` to create initial
  //   config, then `openclaw config set` for schema-validated changes.
  // - Caddy 2.6 (Debian 12 package) does not support TLS for bare IP addresses.
  //   Use HTTP reverse proxy on port 80 instead.
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

echo "=== [4/8] Initializing OpenClaw config ==="
openclaw setup --non-interactive --mode local

echo "=== [5/8] Configuring OpenClaw ==="
# Set model (agents.defaults.model is an object with "primary" key)
openclaw config set agents.defaults.model --json '{"primary": "openrouter/google/gemini-3-flash-preview"}'

# Set OpenRouter API key
openclaw config set env.OPENROUTER_API_KEY '${openRouterApiKey}'

# Gateway settings
openclaw config set gateway.mode local
openclaw config set gateway.bind loopback
openclaw config set gateway.controlUi.allowInsecureAuth true
openclaw config set gateway.trustedProxies --json '["127.0.0.1/32", "::1/128"]'

echo "=== [6/8] Configuring Caddy reverse proxy ==="
cat > /etc/caddy/Caddyfile << CADDYEOF
:80 {
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
# Find the openclaw binary (installed to /usr/bin by npm global)
OPENCLAW_BIN=$(which openclaw)
echo "OpenClaw binary: \${OPENCLAW_BIN}"

# Create systemd service using "gateway run" (foreground mode).
# "gateway start" requires systemd user services which are unavailable
# on minimal VPS images.
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

# Wait for the gateway to start and generate its token
sleep 10

# Extract access token
OCFILE="/root/.openclaw/openclaw.json"
ACCESS_TOKEN=$(openclaw config get gateway.auth.token 2>/dev/null || echo "")
echo "OPENCLAW_ACCESS_TOKEN=\${ACCESS_TOKEN}"

echo "=== Setup complete ==="
SETUPSCRIPT`;
}

// ============================================================
// Health Check
// ============================================================

async function waitForHealth(
  ipAddress: string,
  timeoutMs: number = HEALTH_POLL_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      // Try HTTP via Caddy (port 80 reverse proxy to gateway)
      const res = await fetch(`http://${ipAddress}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok || res.status === 401 || res.status === 403) {
        return true;
      }
    } catch {
      // Not ready yet — try direct gateway port as fallback
      try {
        const res = await fetch(`http://${ipAddress}:${OPENCLAW_PORT}`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          return true;
        }
      } catch {
        // Not ready
      }
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  return false;
}

// ============================================================
// Plan Discovery
// ============================================================

/**
 * Find the first available VPS plan + datacenter from the priority list.
 * Falls back to the first plan with cart datacenters if nothing is in-stock.
 */
async function findAvailablePlanAndDc(): Promise<{ planCode: string; datacenter: string }> {
  for (const plan of VPS_PLANS_PRIORITY) {
    const dc = await ovhService.findAvailableDatacenter(plan);
    if (dc) {
      return { planCode: plan, datacenter: dc };
    }
  }

  // Fallback: use first plan with whatever cart datacenter is available
  const fallbackPlan = VPS_PLANS_PRIORITY[0];
  const cartDcs = await ovhService.getCartDatacenters(fallbackPlan);
  const dc = cartDcs[0] || 'US-EAST-LZ-MIA';
  return { planCode: fallbackPlan, datacenter: dc };
}

// ============================================================
// Deploy Orchestration
// ============================================================

/**
 * Deploy a new OpenClaw instance. This is the main entry point.
 * Creates a deployment record and starts the async provisioning job.
 */
export async function deploy(
  userId: string,
  options: DeployOptions = {}
): Promise<OpenClawDeployment> {
  // Create deployment record
  const deployment = await prisma.openClawDeployment.create({
    data: {
      userId,
      status: 'PENDING',
      statusMessage: 'Deployment initiated',
    },
  });

  // Start async provisioning (don't await — return immediately)
  provisionAsync(deployment.id, options).catch(async (err) => {
    console.error(`[openclaw] Provisioning failed for ${deployment.id}:`, err);
    await updateDeployment(deployment.id, {
      status: 'ERROR',
      statusMessage: `Provisioning failed: ${err.message}`,
    }).catch(console.error);
  });

  return deployment;
}

/**
 * Async provisioning job — runs in the background after deploy() returns.
 */
async function provisionAsync(deploymentId: string, options: DeployOptions): Promise<void> {
  let log = '';

  const addLog = (msg: string) => {
    console.log(`[openclaw:${deploymentId}] ${msg}`);
    log = appendLog(log, msg);
  };

  try {
    // Step 1: Generate SSH key pair (RSA 4096)
    addLog('Generating RSA 4096 SSH key pair...');
    const { publicKey: sshPub, privateKey: sshPriv } = generateSshKeyPair();
    addLog(`SSH key generated (${sshPub.slice(0, 40)}...)`);

    await updateDeployment(deploymentId, {
      sshPublicKey: sshPub,
      sshPrivateKey: sshPriv,
      provisionLog: log,
    });

    // Step 2: Provision OpenRouter API key
    addLog('Provisioning OpenRouter API key...');
    const shortId = deploymentId.slice(-8);
    const orKey = await openRouterService.createKey(`openclaw-${shortId}`, {
      limit: 10, // $10 safety cap
      limit_reset: 'monthly',
    });
    addLog(`OpenRouter key created (hash: ${orKey.hash})`);

    await updateDeployment(deploymentId, {
      openRouterKeyHash: orKey.hash,
      provisionLog: log,
    });

    // Step 3: Find available plan + datacenter
    let planCode = options.planCode;
    let datacenter = options.datacenter;
    const os = options.os || DEFAULT_OS;

    if (!planCode || !datacenter) {
      addLog('Finding available VPS plan + datacenter...');
      const found = await findAvailablePlanAndDc();
      planCode = planCode || found.planCode;
      datacenter = datacenter || found.datacenter;
      addLog(`Found: ${planCode} @ ${datacenter}`);
    }

    // Step 4: Order VPS
    addLog(`Ordering VPS (plan: ${planCode}, dc: ${datacenter}, os: ${os})...`);
    await updateDeployment(deploymentId, {
      status: 'ORDERING',
      statusMessage: 'Placing VPS order with OVH',
      provisionLog: log,
    });

    const order = await ovhService.orderVps({ planCode, datacenter, os });
    addLog(`VPS order placed (orderId: ${order.orderId})`);

    await updateDeployment(deploymentId, {
      ovhOrderId: String(order.orderId),
      provisionLog: log,
    });

    // Step 5: Poll order status until VPS is delivered
    addLog('Waiting for VPS delivery...');
    const deliveredServiceName = await pollForDelivery(order.orderId, addLog);
    addLog(`VPS delivered: ${deliveredServiceName}`);

    await updateDeployment(deploymentId, {
      status: 'PROVISIONING',
      statusMessage: 'VPS delivered, retrieving IP address',
      ovhServiceName: deliveredServiceName,
      provisionLog: log,
    });

    // Step 6: Get VPS IP (with retries — may not be available immediately)
    addLog('Retrieving VPS IP address...');
    const ip = await pollForIp(deliveredServiceName, addLog);
    addLog(`VPS IP: ${ip}`);

    await updateDeployment(deploymentId, {
      ipAddress: ip,
      provisionLog: log,
    });

    // Step 7: Rebuild VPS with SSH key
    // The initial delivery comes with a random password. We rebuild with
    // publicSshKey + doNotSendPassword to inject our key properly.
    addLog('Rebuilding VPS with SSH key...');
    const rebuildImageId = await findRebuildImage(deliveredServiceName, addLog);
    const rebuildResult = await ovhService.rebuildVps(deliveredServiceName, rebuildImageId, sshPub);
    addLog(`Rebuild initiated (task: ${rebuildResult.id}, state: ${rebuildResult.state})`);

    await waitForRebuild(deliveredServiceName, addLog);
    addLog('Rebuild complete, waiting 30s for SSH to come up...');
    await sleep(30_000);

    await updateDeployment(deploymentId, {
      statusMessage: 'VPS rebuilt with SSH key, connecting...',
      provisionLog: log,
    });

    // Step 8: Wait for SSH and run setup
    addLog('Waiting for SSH access...');
    await updateDeployment(deploymentId, {
      status: 'INSTALLING',
      statusMessage: 'Connecting to VPS and installing OpenClaw',
      provisionLog: log,
    });

    const sshUser = await waitForSsh(ip, sshPriv);
    addLog(`SSH connected as ${sshUser}`);

    addLog('Running OpenClaw setup script...');
    const setupScript = buildSetupScript(orKey.key, ip);
    const result = await sshExec(ip, sshUser, sshPriv, setupScript, 15 * 60_000);
    addLog(`Setup script exit code: ${result.code}`);
    if (result.stderr) {
      addLog(`Setup stderr (last 500 chars): ${result.stderr.slice(-500)}`);
    }

    if (result.code !== 0) {
      addLog(`Setup stdout (last 1000 chars): ${result.stdout.slice(-1000)}`);
      throw new Error(`Setup script failed with exit code ${result.code}`);
    }

    // Step 9: Extract access token
    const tokenMatch = result.stdout.match(/OPENCLAW_ACCESS_TOKEN=(.*)/);
    const accessToken = tokenMatch?.[1]?.trim() || '';
    addLog(`Access token: ${accessToken ? accessToken.slice(0, 10) + '...' : 'empty'}`);

    await updateDeployment(deploymentId, {
      accessToken: accessToken || undefined,
      provisionLog: log,
    });

    // Step 10: Wait for health check
    addLog('Waiting for OpenClaw health check...');
    const healthy = await waitForHealth(ip);
    if (healthy) {
      addLog('OpenClaw is healthy and responding!');
    } else {
      addLog('Health check timed out — OpenClaw may still be starting');
    }

    // Mark as READY
    await updateDeployment(deploymentId, {
      status: 'READY',
      statusMessage: healthy ? 'OpenClaw is live and accessible' : 'OpenClaw deployed (health check pending)',
      readyAt: new Date(),
      provisionLog: log,
    });

    addLog('Deployment complete!');

  } catch (err: any) {
    addLog(`ERROR: ${err.message}`);
    await updateDeployment(deploymentId, {
      status: 'ERROR',
      statusMessage: err.message,
      provisionLog: log,
    });
    throw err;
  }
}

// ============================================================
// Polling Helpers
// ============================================================

/**
 * Poll OVH until the VPS order is delivered and return the service name.
 */
async function pollForDelivery(
  orderId: number,
  addLog: (msg: string) => void
): Promise<string> {
  const deadline = Date.now() + ORDER_POLL_TIMEOUT_MS;
  const vpsBefore = new Set(await ovhService.listVps());
  addLog(`Existing VPS count: ${vpsBefore.size}`);

  while (Date.now() < deadline) {
    await sleep(ORDER_POLL_INTERVAL_MS);

    // Check if a new VPS appeared
    const vpsNow = await ovhService.listVps();
    for (const name of vpsNow) {
      if (!vpsBefore.has(name)) {
        return name;
      }
    }

    // Also check order status
    try {
      const status = await ovhService.getOrderStatus(orderId);
      const elapsed = Math.round((Date.now() + ORDER_POLL_TIMEOUT_MS - deadline) / 1000);
      addLog(`[${elapsed}s] Order ${orderId} status: ${status.status}`);

      const serviceName = await ovhService.getOrderAssociatedService(orderId);
      if (serviceName && serviceName.startsWith('vps')) {
        return serviceName;
      }
    } catch (err: any) {
      addLog(`Order status check error: ${err.message}`);
    }
  }

  throw new Error(`VPS delivery timed out after ${ORDER_POLL_TIMEOUT_MS / 60_000} minutes`);
}

/**
 * Poll for VPS IP address (may not be available immediately after delivery).
 */
async function pollForIp(
  serviceName: string,
  addLog: (msg: string) => void
): Promise<string> {
  const deadline = Date.now() + IP_POLL_TIMEOUT_MS;
  const isIpv4 = (ip: string) => /^\d+\.\d+\.\d+\.\d+$/.test(ip);

  for (let attempt = 0; Date.now() < deadline; attempt++) {
    // Try getVpsIps first (more reliable)
    try {
      const ips = await ovhService.getVpsIps(serviceName);
      if (ips.length > 0) {
        return ips.find(isIpv4) || ips[0];
      }
    } catch {}

    // Fallback to getVpsDetails
    try {
      const details = await ovhService.getVpsDetails(serviceName);
      if (details.ips && details.ips.length > 0) {
        return details.ips.find(isIpv4) || details.ips[0];
      }
    } catch {}

    addLog(`Waiting for IP (attempt ${attempt + 1})...`);
    await sleep(IP_POLL_INTERVAL_MS);
  }

  throw new Error(`Could not retrieve IP for ${serviceName}`);
}

/**
 * Find the Debian 12 rebuild image for a VPS.
 */
async function findRebuildImage(
  serviceName: string,
  addLog: (msg: string) => void
): Promise<string> {
  const imageIds = await ovhService.getAvailableImages(serviceName);
  for (const imgId of imageIds) {
    try {
      const img = await ovhService.getImageDetails(serviceName, imgId);
      if (img.name === REBUILD_IMAGE_NAME) {
        addLog(`Found rebuild image: ${img.name} (${imgId})`);
        return imgId;
      }
    } catch {}
  }

  addLog(`Image "${REBUILD_IMAGE_NAME}" not found, using first available`);
  if (imageIds.length === 0) throw new Error('No rebuild images available');
  return imageIds[0];
}

/**
 * Wait for VPS rebuild to complete (state: installing → running).
 */
async function waitForRebuild(
  serviceName: string,
  addLog: (msg: string) => void
): Promise<void> {
  const deadline = Date.now() + REBUILD_POLL_TIMEOUT_MS;
  let wasInstalling = false;

  while (Date.now() < deadline) {
    await sleep(REBUILD_POLL_INTERVAL_MS);
    try {
      const details = await ovhService.getVpsDetails(serviceName);
      const elapsed = Math.round((Date.now() + REBUILD_POLL_TIMEOUT_MS - deadline) / 1000);
      addLog(`[${elapsed}s] VPS state: ${details.state}`);
      if (details.state === 'installing') wasInstalling = true;
      if (details.state === 'running' && wasInstalling) return;
    } catch (e: any) {
      addLog(`Rebuild poll error: ${e.message}`);
    }
  }

  throw new Error(`VPS rebuild timed out after ${REBUILD_POLL_TIMEOUT_MS / 60_000} minutes`);
}

// ============================================================
// CRUD
// ============================================================

/**
 * Get a deployment by ID, scoped to user.
 */
export async function getDeployment(
  deploymentId: string,
  userId: string
): Promise<OpenClawDeployment | null> {
  return prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId },
  });
}

/**
 * List all deployments for a user.
 */
export async function listDeployments(userId: string): Promise<OpenClawDeployment[]> {
  return prisma.openClawDeployment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Destroy a deployment — terminate VPS and revoke OpenRouter key.
 */
export async function destroy(
  deploymentId: string,
  userId: string
): Promise<OpenClawDeployment> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId },
  });

  if (!deployment) {
    throw new Error('Deployment not found');
  }

  if (deployment.status === 'DESTROYED' || deployment.status === 'DESTROYING') {
    return deployment;
  }

  await updateDeployment(deploymentId, {
    status: 'DESTROYING',
    statusMessage: 'Termination in progress',
  });

  try {
    // Terminate VPS
    if (deployment.ovhServiceName) {
      try {
        await ovhService.terminateVps(deployment.ovhServiceName);
      } catch (err: any) {
        console.error(`[openclaw] Failed to terminate VPS ${deployment.ovhServiceName}:`, err);
      }
    }

    // Revoke OpenRouter key
    if (deployment.openRouterKeyHash) {
      try {
        await openRouterService.deleteKey(deployment.openRouterKeyHash);
      } catch (err: any) {
        console.error(`[openclaw] Failed to revoke OpenRouter key:`, err);
      }
    }

    return await updateDeployment(deploymentId, {
      status: 'DESTROYED',
      statusMessage: 'Deployment destroyed',
      destroyedAt: new Date(),
    });
  } catch (err: any) {
    await updateDeployment(deploymentId, {
      status: 'ERROR',
      statusMessage: `Destroy failed: ${err.message}`,
    });
    throw err;
  }
}

/**
 * Restart OpenClaw on a deployment's VPS via SSH.
 */
export async function restart(
  deploymentId: string,
  userId: string
): Promise<OpenClawDeployment> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId, status: 'READY' },
  });

  if (!deployment) {
    throw new Error('Deployment not found or not in READY state');
  }

  if (!deployment.ipAddress || !deployment.sshPrivateKey) {
    throw new Error('Deployment missing IP or SSH key — cannot restart');
  }

  await sshExec(
    deployment.ipAddress,
    SSH_USERNAME,
    deployment.sshPrivateKey,
    'sudo systemctl restart openclaw-gateway',
    30_000
  );

  return deployment;
}
