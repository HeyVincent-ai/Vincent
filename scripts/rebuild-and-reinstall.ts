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

  const addLog = (msg: string) => console.log(`  ${msg}`);

  // Step 2: Find rebuild image
  console.log('\n[2/7] Finding Debian 12 image...');
  const rebuildImageId = await findRebuildImage(serviceName, addLog);

  // Step 3: Rebuild VPS
  console.log('\n[3/7] Rebuilding VPS with SSH key...');
  const rebuildResult = await ovhService.rebuildVps(serviceName, rebuildImageId, sshPub);
  console.log(`  Rebuild initiated (task: ${rebuildResult.id}, state: ${rebuildResult.state})`);

  // Step 4: Wait for rebuild
  console.log('\n[4/7] Waiting for VPS rebuild...');
  await waitForRebuild(serviceName, addLog);
  console.log('  Rebuild complete. Waiting 30s for SSH to come up...');
  await sleep(30_000);

  // Step 5: Wait for SSH and identify user
  console.log('\n[5/7] Connecting via SSH...');
  const sshUser = await waitForSsh(ip, sshPriv);
  console.log(`  SSH connected as ${sshUser}`);

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
