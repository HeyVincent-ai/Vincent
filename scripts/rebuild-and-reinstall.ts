/**
 * Rebuild a "dirty" VPS with Debian 12 + SSH key, then install OpenClaw
 * with Caddy HTTPS — producing a working OpenClaw web UI.
 *
 * Uses the same service functions as the production deploy flow, including
 * the detached setup script approach (nohup + polling marker files).
 *
 * Usage:
 *   npx tsx scripts/rebuild-and-reinstall.ts <hostname> <ssh-private-key-path> [--skip-rebuild]
 *
 * Example:
 *   npx tsx scripts/rebuild-and-reinstall.ts vps-83301d85.vps.ovh.us .e2e-keys/staging
 *   npx tsx scripts/rebuild-and-reinstall.ts vps-83301d85.vps.ovh.us .e2e-keys/staging --skip-rebuild
 *
 * The OVH service name and hostname are the same (e.g. vps-xxxx.vps.ovh.us).
 * IP is resolved automatically via OVH API.
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { utils: sshUtils } = require('ssh2');

import * as ovhService from '../src/services/ovh.service.js';
import * as openRouterService from '../src/services/openrouter.service.js';
import {
  sleep,
  sshExec,
  buildSetupScript,
  findRebuildImage,
  waitForRebuild,
  waitForSsh,
  waitForHealth,
} from '../src/services/openclaw.service.js';

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const skipRebuild = args.includes('--skip-rebuild');
  const positional = args.filter((a) => !a.startsWith('--'));
  const [hostname, keyPath] = positional;

  if (!hostname || !keyPath) {
    console.error('Usage: npx tsx scripts/rebuild-and-reinstall.ts <hostname> <ssh-private-key-path> [--skip-rebuild]');
    console.error('Example: npx tsx scripts/rebuild-and-reinstall.ts vps-83301d85.vps.ovh.us .e2e-keys/staging');
    process.exit(1);
  }

  const serviceName = hostname;
  const addLog = (msg: string) => console.log(`  ${msg}`);

  console.log(`\n=== Rebuild & Reinstall ===`);
  console.log(`  Hostname:      ${hostname}`);
  console.log(`  Service:       ${serviceName}`);
  console.log(`  Key file:      ${keyPath}`);
  console.log(`  Skip rebuild:  ${skipRebuild}`);

  // Step 1: Read SSH key pair
  console.log('\n[1] Reading SSH private key...');
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

  // Step 2: Get VPS IP
  console.log('\n[2] Getting VPS IP...');
  const ips = await ovhService.getVpsIps(serviceName);
  const ip = ips.find((i: string) => /^\d+\.\d+\.\d+\.\d+$/.test(i)) || ips[0];
  if (!ip) throw new Error('Could not get VPS IP');
  console.log(`  IP: ${ip}`);

  if (!skipRebuild) {
    // Step 3: Find rebuild image
    console.log('\n[3] Finding Debian 12 image...');
    const rebuildImageId = await findRebuildImage(serviceName, addLog);

    // Step 4: Rebuild VPS
    console.log('\n[4] Rebuilding VPS with SSH key...');
    const rebuildResult = await ovhService.rebuildVps(serviceName, rebuildImageId, sshPub);
    console.log(`  Rebuild initiated (task: ${rebuildResult.id}, state: ${rebuildResult.state})`);

    // Step 5: Wait for rebuild
    console.log('\n[5] Waiting for VPS rebuild...');
    await waitForRebuild(serviceName, addLog, rebuildResult.id);
    console.log('  Rebuild complete. Waiting 30s for SSH to come up...');
    await sleep(30_000);
  } else {
    console.log('\n[3-5] Skipping rebuild (--skip-rebuild)');
  }

  // Step 6: Wait for SSH and identify user
  console.log('\n[6] Connecting via SSH...');
  const sshUser = await waitForSsh(ip, sshPriv);
  console.log(`  SSH connected as ${sshUser}`);

  // Clean up any previous setup artifacts
  console.log('  Cleaning up previous setup artifacts...');
  await sshExec(ip, sshUser, sshPriv,
    'sudo rm -f /root/.openclaw-setup-started /root/.openclaw-setup-complete /root/.openclaw-setup-error /root/.openclaw-setup-token /root/openclaw-setup.log /root/openclaw-setup.sh',
    15_000
  );

  // Step 7: Provision OpenRouter key
  console.log('\n[7] Provisioning OpenRouter key...');
  const orKey = await openRouterService.createKey(`openclaw-rebuild-${Date.now()}`, {
    limit: 10,
    limit_reset: 'monthly',
  });
  console.log(`  OpenRouter key created (hash: ${orKey.hash})`);

  // Step 8: Upload and launch setup script (detached)
  console.log('\n[8] Launching detached setup script...');
  const setupScript = buildSetupScript(orKey.key, hostname);

  // Upload via base64
  const b64 = Buffer.from(setupScript).toString('base64');
  await sshExec(ip, sshUser, sshPriv,
    `echo '${b64}' | base64 -d | sudo tee /root/openclaw-setup.sh > /dev/null && sudo chmod +x /root/openclaw-setup.sh`,
    30_000
  );
  console.log('  Setup script uploaded');

  // Launch detached — redirect INSIDE sudo's shell so root can write to /root/
  await sshExec(ip, sshUser, sshPriv,
    `sudo bash -c 'nohup bash /root/openclaw-setup.sh > /root/openclaw-setup.log 2>&1 &'`,
    15_000
  );
  console.log('  Setup script launched in background on VPS');

  // Step 9: Poll for setup completion
  console.log('\n[9] Polling for setup completion...');
  const POLL_INTERVAL = 15_000;
  const POLL_TIMEOUT = 15 * 60_000;
  const deadline = Date.now() + POLL_TIMEOUT;
  let accessToken = '';

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL);

    // Check for error
    try {
      const errResult = await sshExec(ip, sshUser, sshPriv,
        'sudo cat /root/.openclaw-setup-error 2>/dev/null',
        15_000
      );
      if (errResult.stdout.trim()) {
        // Grab the log for debugging
        const logResult = await sshExec(ip, sshUser, sshPriv,
          'sudo tail -50 /root/openclaw-setup.log 2>/dev/null',
          15_000
        );
        console.error('\n=== SETUP FAILED ===');
        console.error(`Error: ${errResult.stdout.trim()}`);
        console.error('\nSetup log (last 50 lines):');
        console.error(logResult.stdout);
        process.exit(1);
      }
    } catch {
      // SSH error — transient
    }

    // Check for completion
    try {
      const completeResult = await sshExec(ip, sshUser, sshPriv,
        'sudo cat /root/.openclaw-setup-complete 2>/dev/null',
        15_000
      );
      if (completeResult.stdout.trim() === 'COMPLETE') {
        const tokenResult = await sshExec(ip, sshUser, sshPriv,
          'sudo cat /root/.openclaw-setup-token 2>/dev/null',
          15_000
        );
        accessToken = tokenResult.stdout.trim();
        console.log(`  Setup complete! Token: ${accessToken ? accessToken.slice(0, 12) + '...' : '(empty)'}`);
        break;
      }
    } catch {
      // SSH error — transient
    }

    // Show progress from the log
    try {
      const logResult = await sshExec(ip, sshUser, sshPriv,
        'sudo tail -3 /root/openclaw-setup.log 2>/dev/null',
        15_000
      );
      const lastLine = logResult.stdout.trim().split('\n').pop() || '';
      const remaining = Math.round((deadline - Date.now()) / 60_000);
      console.log(`  [~${remaining}m left] ${lastLine}`);
    } catch {
      console.log(`  Waiting... (SSH temporarily unavailable)`);
    }
  }

  if (!accessToken && Date.now() >= deadline) {
    // Timeout — grab log for debugging
    try {
      const logResult = await sshExec(ip, sshUser, sshPriv,
        'sudo tail -50 /root/openclaw-setup.log 2>/dev/null',
        15_000
      );
      console.error('\n=== SETUP TIMED OUT ===');
      console.error('Setup log (last 50 lines):');
      console.error(logResult.stdout);
    } catch {}
    process.exit(1);
  }

  // Step 10: Health check
  console.log('\n[10] Waiting for HTTPS health check...');
  const healthy = await waitForHealth(ip, hostname);
  if (healthy) {
    console.log(`  HTTPS healthy!`);
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
