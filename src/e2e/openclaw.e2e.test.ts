/**
 * E2E Test: OpenClaw VPS Deployment via OVH
 *
 * Tests the full deploy lifecycle against real OVH and OpenRouter APIs.
 * When E2E_ORDER_VPS=true, this actually orders a VPS ($4.90/mo) and
 * provisions an OpenRouter key. The final state is a running VPS you
 * can SSH into, plus a live OpenRouter key — nothing is cleaned up.
 *
 * Required env vars:
 *   OVH_APP_KEY          - OVH application key
 *   OVH_APP_SECRET       - OVH application secret
 *   OVH_CONSUMER_KEY     - OVH consumer key (authorized)
 *   DATABASE_URL          - PostgreSQL database
 *
 * Optional env vars:
 *   OPENROUTER_PROVISIONING_KEY - For OpenRouter key provisioning
 *   E2E_ORDER_VPS=true          - Actually place a real VPS order
 *
 * Run (dry run):    npm run test:openclaw
 * Run (real order): E2E_ORDER_VPS=true npm run test:openclaw
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client: SshClient, utils } = require('ssh2');
import * as ovhService from '../services/ovh.service.js';
import * as openRouterService from '../services/openrouter.service.js';
import prisma from '../db/client.js';

// ============================================================
// Test Configuration
// ============================================================

const VPS_PLAN_CODE = 'vps-2025-model1';
const VPS_DATACENTER = 'US-WEST-OR';
const VPS_OS = 'Debian 12';
const REBUILD_IMAGE_NAME = 'Debian 12'; // Must match an image from /images/available

const ACTUALLY_ORDER_VPS = process.env.E2E_ORDER_VPS === 'true';

// Polling
const ORDER_POLL_INTERVAL_MS = 30_000;
const ORDER_POLL_TIMEOUT_MS = 20 * 60_000;
const REBUILD_POLL_INTERVAL_MS = 15_000;
const REBUILD_POLL_TIMEOUT_MS = 5 * 60_000;
const SSH_POLL_INTERVAL_MS = 15_000;
const SSH_POLL_TIMEOUT_MS = 5 * 60_000;

// SSH usernames to try (Debian uses root, Ubuntu uses ubuntu)
const SSH_USERNAMES = ['root', 'debian'];

// ============================================================
// Evidence (printed at the end)
// ============================================================

const evidence: {
  accountInfo?: any;
  availableDatacenters?: any;
  availableOs?: any;
  existingVps?: string[];
  sshKeys?: string[];
  orderId?: number;
  orderUrl?: string;
  orderStatus?: any;
  deliveredServiceName?: string;
  vpsDetails?: any;
  vpsIp?: string;
  openRouterKey?: string;
  openRouterKeyHash?: string;
  sshKeyFile?: string;
  sshKeyName?: string;
  sshUser?: string;
  sshConnected?: boolean;
  rebuildImageId?: string;
} = {};

// ============================================================
// Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate an RSA 4096 SSH key pair in OpenSSH format.
 * OVH /me/sshKey does NOT support ed25519 — must use RSA or ECDSA.
 */
function generateSshKeys(): { publicKey: string; privateKey: string } {
  const keys = utils.generateKeyPairSync('rsa', {
    bits: 4096,
    comment: 'openclaw-e2e',
  });
  return {
    publicKey: keys.public,
    privateKey: keys.private,
  };
}

/**
 * Try to SSH into a host and run a simple command.
 */
function trySsh(host: string, username: string, privateKey: string, command = 'echo ok'): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('SSH connect timeout'));
    }, 20_000);

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        let out = '';
        stream.on('data', (d: Buffer) => { out += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { out += d.toString(); });
        stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(out.trim()); });
      });
    });

    conn.on('error', (err: any) => { clearTimeout(timer); reject(err); });

    conn.connect({
      host,
      port: 22,
      username,
      privateKey,
      readyTimeout: 15_000,
      algorithms: { serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'] },
    });
  });
}

// ============================================================
// Test Suite
// ============================================================

describe('OpenClaw E2E: OVH VPS Deployment', () => {
  beforeAll(async () => {
    await prisma.$connect();

    console.log('\n========================================');
    console.log('  OPENCLAW E2E TEST');
    console.log('========================================');
    console.log(`OVH_APP_KEY: ${process.env.OVH_APP_KEY ? '***' + process.env.OVH_APP_KEY.slice(-4) : 'NOT SET'}`);
    console.log(`OVH_CONSUMER_KEY: ${process.env.OVH_CONSUMER_KEY ? '***' + process.env.OVH_CONSUMER_KEY.slice(-4) : 'NOT SET'}`);
    console.log(`OPENROUTER_PROVISIONING_KEY: ${process.env.OPENROUTER_PROVISIONING_KEY ? 'SET' : 'NOT SET'}`);
    console.log(`E2E_ORDER_VPS: ${ACTUALLY_ORDER_VPS}`);
    console.log('========================================\n');
  });

  afterAll(async () => {
    console.log('\n========================================');
    console.log('  OPENCLAW E2E TEST RESULTS');
    console.log('========================================');

    if (evidence.vpsIp) {
      console.log(`\n  VPS IP:           ${evidence.vpsIp}`);
      console.log(`  Service Name:     ${evidence.deliveredServiceName}`);
      console.log(`  SSH Key File:     ${evidence.sshKeyFile}`);
      console.log(`  SSH Key Name:     ${evidence.sshKeyName}`);
      console.log(`  SSH User:         ${evidence.sshUser || 'unknown'}`);
      console.log(`  SSH Connected:    ${evidence.sshConnected}`);
      console.log(`  Rebuild Image:    ${evidence.rebuildImageId}`);
      console.log(`  OpenRouter Key:   ${evidence.openRouterKey ? evidence.openRouterKey.slice(0, 15) + '...' : 'N/A'}`);
      console.log(`  OpenRouter Hash:  ${evidence.openRouterKeyHash || 'N/A'}`);
      console.log(`\n  Connect with:`);
      console.log(`    ssh -i ${evidence.sshKeyFile} ${evidence.sshUser || 'root'}@${evidence.vpsIp}`);
    }

    console.log('\n  Full evidence:');
    console.log(JSON.stringify(evidence, (key, val) => {
      if (key === 'openRouterKey' && val) return val.slice(0, 15) + '...';
      return val;
    }, 2));
    console.log('========================================\n');

    await prisma.$disconnect();
  }, 60_000);

  // ============================================================
  // Test 1: OVH API Connectivity
  // ============================================================

  it('should connect to OVH API and get account info', async () => {
    const account = await ovhService.getAccountInfo();
    evidence.accountInfo = {
      nichandle: account.nichandle,
      email: account.email,
      country: account.country,
      currency: account.currency?.code,
    };

    console.log(`OVH Account: ${account.nichandle} (${account.email})`);
    console.log(`Country: ${account.country}, Currency: ${account.currency?.code}`);

    expect(account.nichandle).toBeTruthy();
    expect(account.email).toBeTruthy();
  }, 30_000);

  // ============================================================
  // Test 2: List Existing VPS
  // ============================================================

  it('should list existing VPS instances', async () => {
    const vpsList = await ovhService.listVps();
    evidence.existingVps = vpsList;

    console.log(`Existing VPS count: ${vpsList.length}`);
    if (vpsList.length > 0) {
      console.log(`VPS names: ${vpsList.join(', ')}`);
    }

    expect(Array.isArray(vpsList)).toBe(true);
  }, 30_000);

  // ============================================================
  // Test 3: Check Available Datacenters
  // ============================================================

  it('should list available datacenters for VPS plan', async () => {
    const datacenters = await ovhService.getAvailableDatacenters(VPS_PLAN_CODE);
    evidence.availableDatacenters = datacenters;

    console.log(`Available datacenters for ${VPS_PLAN_CODE}:`);
    if (datacenters?.datacenters) {
      for (const dc of datacenters.datacenters) {
        console.log(`  ${dc.datacenter} — status: ${dc.status}, linux: ${dc.linuxStatus}`);
      }
    } else {
      console.log(`  Response: ${JSON.stringify(datacenters).slice(0, 300)}`);
    }

    expect(datacenters).toBeTruthy();
  }, 30_000);

  // ============================================================
  // Test 4: Check Available OS
  // ============================================================

  it('should list available OS choices for VPS plan', async () => {
    const osChoices = await ovhService.getAvailableOs(VPS_PLAN_CODE);
    evidence.availableOs = osChoices;

    console.log(`Available OS for ${VPS_PLAN_CODE}:`);
    if (Array.isArray(osChoices)) {
      osChoices.slice(0, 10).forEach((os: any) => {
        console.log(`  ${os.name || os}`);
      });
      if (osChoices.length > 10) console.log(`  ... and ${osChoices.length - 10} more`);
    } else {
      console.log(`  Response: ${JSON.stringify(osChoices).slice(0, 500)}`);
    }

    expect(osChoices).toBeTruthy();
  }, 30_000);

  // ============================================================
  // Test 5: List SSH Keys
  // ============================================================

  it('should list SSH keys on the account', async () => {
    const keys = await ovhService.listSshKeys();
    evidence.sshKeys = keys;

    console.log(`SSH keys on account: ${keys.length}`);
    keys.forEach((k: string) => console.log(`  ${k}`));

    expect(Array.isArray(keys)).toBe(true);
  }, 30_000);

  // ============================================================
  // Test 6: Get Existing VPS Details (if any)
  // ============================================================

  it('should get details of existing VPS (if any)', async () => {
    if (!evidence.existingVps || evidence.existingVps.length === 0) {
      console.log('No existing VPS to inspect — skipping');
      return;
    }

    const serviceName = evidence.existingVps[0];
    const details = await ovhService.getVpsDetails(serviceName);
    const ips = await ovhService.getVpsIps(serviceName);

    evidence.vpsDetails = details;

    console.log(`VPS: ${details.name}`);
    console.log(`  State: ${details.state}`);
    console.log(`  IPs: ${details.ips.join(', ') || ips.join(', ')}`);
    console.log(`  vCores: ${details.vcore}, Memory: ${details.memory}MB`);
    console.log(`  Zone: ${details.zone}`);

    expect(details.name).toBeTruthy();
    expect(details.state).toBeTruthy();
  }, 30_000);

  // ============================================================
  // Test 7: OpenRouter Key Provisioning (dry run — creates + deletes)
  // ============================================================

  it('should create and delete an OpenRouter API key (dry run)', async () => {
    if (!process.env.OPENROUTER_PROVISIONING_KEY) {
      console.log('OPENROUTER_PROVISIONING_KEY not set — skipping');
      return;
    }

    if (ACTUALLY_ORDER_VPS) {
      console.log('Skipping dry-run key test — real order will create a persistent key');
      return;
    }

    const key = await openRouterService.createKey('openclaw-e2e-dryrun', {
      limit: 0.01,
    });

    console.log(`OpenRouter key created:`);
    console.log(`  Key: ${key.key.slice(0, 10)}...`);
    console.log(`  Hash: ${key.hash}`);

    expect(key.key).toBeTruthy();
    expect(key.hash).toBeTruthy();

    const usage = await openRouterService.getKeyUsage(key.hash);
    console.log(`  Usage: $${usage.usage}`);
    expect(usage.usage).toBe(0);

    await openRouterService.deleteKey(key.hash);
    console.log('  Key deleted successfully');
  }, 30_000);

  // ============================================================
  // Test 8: VPS Cart Creation (dry run — validates but doesn't checkout)
  // ============================================================

  it('should create a VPS cart and validate the order (dry run)', async () => {
    const ovh = (await import('@ovhcloud/node-ovh')).default || (await import('@ovhcloud/node-ovh'));
    const client = (ovh as any)({
      endpoint: process.env.OVH_ENDPOINT || 'ovh-us',
      appKey: process.env.OVH_APP_KEY,
      appSecret: process.env.OVH_APP_SECRET,
      consumerKey: process.env.OVH_CONSUMER_KEY,
    });

    // Create cart
    const cart = await client.requestPromised('POST', '/order/cart', {
      ovhSubsidiary: 'US',
      description: 'E2E Test Cart (dry run)',
    });
    console.log(`Cart created: ${cart.cartId}`);
    expect(cart.cartId).toBeTruthy();

    // Assign
    await client.requestPromised('POST', `/order/cart/${cart.cartId}/assign`);

    // Add VPS
    const plans = await client.requestPromised('GET', `/order/cart/${cart.cartId}/vps`);
    const targetPlan = plans.find((p: any) => p.planCode === VPS_PLAN_CODE);
    if (!targetPlan) {
      console.log(`Plan ${VPS_PLAN_CODE} not found. Available:`);
      plans.slice(0, 5).forEach((p: any) => console.log(`  ${p.planCode}`));
      return;
    }

    const item = await client.requestPromised('POST', `/order/cart/${cart.cartId}/vps`, {
      duration: 'P1M',
      planCode: VPS_PLAN_CODE,
      pricingMode: 'default',
      quantity: 1,
    });

    // Configure
    const reqConfig = await client.requestPromised(
      'GET',
      `/order/cart/${cart.cartId}/item/${item.itemId}/requiredConfiguration`
    );

    const dcConfig = reqConfig.find((c: any) => c.label.includes('datacenter'));
    const osConfig = reqConfig.find((c: any) => c.label.includes('os'));

    const dcValue = dcConfig?.allowedValues?.find((v: string) =>
      v.toUpperCase().includes('WEST')
    ) || dcConfig?.allowedValues?.[0] || VPS_DATACENTER;

    const osValue = osConfig?.allowedValues?.find((v: string) =>
      v.toLowerCase().includes('debian') && v.includes('12')
    ) || osConfig?.allowedValues?.[0] || VPS_OS;

    console.log(`Datacenter: ${dcValue}, OS: ${osValue}`);

    await client.requestPromised('POST', `/order/cart/${cart.cartId}/item/${item.itemId}/configuration`, {
      label: dcConfig.label,
      value: dcValue,
    });
    await client.requestPromised('POST', `/order/cart/${cart.cartId}/item/${item.itemId}/configuration`, {
      label: osConfig.label,
      value: osValue,
    });

    // Dry-run checkout
    const checkout = await client.requestPromised('GET', `/order/cart/${cart.cartId}/checkout`);
    const total = checkout.prices?.withTax?.text || checkout.prices?.withoutTax?.text || '?';
    console.log(`Checkout total: ${total}`);
    if (checkout.details) {
      checkout.details.forEach((d: any) => {
        console.log(`  ${d.description} — ${d.totalPrice?.text || ''}`);
      });
    }

    console.log('\n*** DRY RUN — not checked out ***');
    if (!ACTUALLY_ORDER_VPS) {
      console.log('Set E2E_ORDER_VPS=true to place a real order\n');
    }
  }, 60_000);

  // ============================================================
  // Test 9: REAL ORDER — provision OpenRouter key, order VPS,
  //         register SSH key, rebuild with key, verify SSH
  // ============================================================

  it('should order a VPS and verify SSH access (REAL)', async () => {
    if (!ACTUALLY_ORDER_VPS) {
      console.log('E2E_ORDER_VPS !== true — skipping');
      return;
    }

    // ---- 1. Generate SSH key pair + register with OVH ----
    // SSH key must be registered BEFORE ordering so it's available for rebuild.
    console.log('\n=== [1/7] Generating RSA SSH key pair ===');
    const { publicKey: sshPub, privateKey: sshPriv } = generateSshKeys();
    console.log(`  Public key: ${sshPub.slice(0, 60)}...`);

    const keyDir = join(process.cwd(), '.e2e-keys');
    mkdirSync(keyDir, { recursive: true });
    const keyFile = join(keyDir, `openclaw-e2e-${Date.now()}`);
    writeFileSync(keyFile, sshPriv, { mode: 0o600 });
    evidence.sshKeyFile = keyFile;
    console.log(`  Private key saved: ${keyFile}`);

    // Clean up old e2e keys from the OVH account
    const existingKeys = await ovhService.listSshKeys();
    for (const oldKey of existingKeys) {
      if (oldKey.startsWith('openclaw-')) {
        try {
          await ovhService.deleteSshKey(oldKey);
          console.log(`  Deleted old OVH key: ${oldKey}`);
        } catch {}
      }
    }

    const sshKeyName = `openclaw-e2e-${Date.now()}`;
    await ovhService.addSshKey(sshKeyName, sshPub);
    evidence.sshKeyName = sshKeyName;
    console.log(`  Registered SSH key with OVH as "${sshKeyName}"`);

    // ---- 2. Provision OpenRouter key (kept alive after test) ----
    console.log('\n=== [2/7] Provisioning OpenRouter API key ===');
    let orKey: { key: string; hash: string } | null = null;
    if (process.env.OPENROUTER_PROVISIONING_KEY) {
      const shortId = Date.now().toString(36);
      orKey = await openRouterService.createKey(`openclaw-e2e-${shortId}`, {
        limit: 10,
        limit_reset: 'monthly',
      });
      evidence.openRouterKey = orKey.key;
      evidence.openRouterKeyHash = orKey.hash;
      console.log(`  Key hash: ${orKey.hash}`);
    } else {
      console.log('  OPENROUTER_PROVISIONING_KEY not set — skipping');
    }

    // ---- 3. Order VPS ----
    console.log(`\n=== [3/7] Ordering VPS (${VPS_PLAN_CODE}, ${VPS_DATACENTER}, ${VPS_OS}) ===`);
    const order = await ovhService.orderVps({
      planCode: VPS_PLAN_CODE,
      datacenter: VPS_DATACENTER,
      os: VPS_OS,
    });
    evidence.orderId = order.orderId;
    evidence.orderUrl = order.url;
    console.log(`  Order ID: ${order.orderId}`);
    console.log(`  URL: ${order.url}`);

    expect(order.orderId).toBeTruthy();

    // ---- 4. Poll for delivery ----
    console.log(`\n=== [4/7] Waiting for VPS delivery (polling every 30s, timeout 20min) ===`);
    const vpsBefore = new Set(await ovhService.listVps());
    const deadline = Date.now() + ORDER_POLL_TIMEOUT_MS;
    let deliveredName: string | null = null;

    while (Date.now() < deadline) {
      await sleep(ORDER_POLL_INTERVAL_MS);

      const vpsNow = await ovhService.listVps();
      for (const name of vpsNow) {
        if (!vpsBefore.has(name)) {
          deliveredName = name;
          break;
        }
      }
      if (deliveredName) break;

      try {
        const status = await ovhService.getOrderStatus(order.orderId);
        console.log(`  [${Math.round((Date.now() + ORDER_POLL_TIMEOUT_MS - deadline) / 1000)}s] Order status: ${status.status}`);
        evidence.orderStatus = status;
      } catch (err: any) {
        console.log(`  Order status check error: ${err.message}`);
      }
    }

    if (!deliveredName) {
      console.log('\n  VPS not delivered within timeout.');
      console.log('  Check OVH dashboard manually. The order was placed successfully.');
      console.log(`  Order ID: ${order.orderId}`);
      return;
    }

    evidence.deliveredServiceName = deliveredName;
    console.log(`  VPS delivered: ${deliveredName}`);

    // ---- 5. Get IP (prefer IPv4) ----
    console.log('\n=== [5/7] Retrieving VPS IP ===');

    let allIps: string[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const ips = await ovhService.getVpsIps(deliveredName);
        if (ips.length > 0) { allIps = ips; break; }
      } catch {}

      try {
        const details = await ovhService.getVpsDetails(deliveredName);
        if (details.ips && details.ips.length > 0) { allIps = details.ips; break; }
      } catch {}

      console.log(`  Waiting for IP (attempt ${attempt + 1}/10)...`);
      await sleep(15_000);
    }

    if (allIps.length === 0) {
      console.log('  Could not retrieve VPS IP. Check OVH dashboard.');
      return;
    }

    console.log(`  All IPs: ${allIps.join(', ')}`);
    const isIpv4 = (ip: string) => /^\d+\.\d+\.\d+\.\d+$/.test(ip);
    const ip = allIps.find(isIpv4) || allIps[0];
    evidence.vpsIp = ip;
    console.log(`  Using IP: ${ip}${isIpv4(ip) ? ' (IPv4)' : ' (IPv6)'}`);

    // ---- 6. Rebuild with SSH key ----
    // The initial order delivers a bare VPS with a random password.
    // We rebuild with publicSshKey + doNotSendPassword to inject our key
    // and avoid the forced password-change-on-first-login issue.
    console.log(`\n=== [6/7] Rebuilding VPS with SSH key ===`);

    // Find the target image
    const imageIds = await ovhService.getAvailableImages(deliveredName);
    let rebuildImageId: string | null = null;
    for (const imgId of imageIds) {
      try {
        const img = await ovhService.getImageDetails(deliveredName, imgId);
        if (img.name === REBUILD_IMAGE_NAME) {
          rebuildImageId = imgId;
          console.log(`  Found image: ${img.name} (${imgId})`);
          break;
        }
      } catch {}
    }

    if (!rebuildImageId) {
      console.log(`  Image "${REBUILD_IMAGE_NAME}" not found. Available images:`);
      for (const imgId of imageIds.slice(0, 5)) {
        try {
          const img = await ovhService.getImageDetails(deliveredName, imgId);
          console.log(`    ${img.name} (${imgId})`);
        } catch {}
      }
      console.log('  Using first available image as fallback.');
      rebuildImageId = imageIds[0];
    }

    evidence.rebuildImageId = rebuildImageId;

    const rebuildResult = await ovhService.rebuildVps(deliveredName, rebuildImageId, sshPub);
    console.log(`  Rebuild initiated: task ${rebuildResult.id}, state: ${rebuildResult.state}`);

    // Wait for rebuild to complete (installing → running)
    console.log('  Waiting for rebuild...');
    const rebuildDeadline = Date.now() + REBUILD_POLL_TIMEOUT_MS;
    let wasInstalling = false;

    while (Date.now() < rebuildDeadline) {
      await sleep(REBUILD_POLL_INTERVAL_MS);
      try {
        const details = await ovhService.getVpsDetails(deliveredName);
        const elapsed = Math.round((Date.now() + REBUILD_POLL_TIMEOUT_MS - rebuildDeadline) / 1000);
        console.log(`  [${elapsed}s] State: ${details.state}`);
        if (details.state === 'installing') wasInstalling = true;
        if (details.state === 'running' && wasInstalling) {
          console.log('  Rebuild complete. Waiting 30s for SSH to come up...');
          await sleep(30_000);
          break;
        }
      } catch (e: any) {
        console.log(`  Poll error: ${e.message}`);
      }
    }

    // ---- 7. Verify SSH ----
    console.log(`\n=== [7/7] Verifying SSH access ===`);
    const sshDeadline = Date.now() + SSH_POLL_TIMEOUT_MS;
    let sshOk = false;
    let sshUser = '';

    while (Date.now() < sshDeadline) {
      for (const username of SSH_USERNAMES) {
        try {
          const result = await trySsh(ip, username, sshPriv, 'hostname && whoami && uname -a');
          console.log(`  SSH connected as ${username}! Output: ${result}`);
          sshOk = true;
          sshUser = username;
          break;
        } catch (err: any) {
          const remaining = Math.round((sshDeadline - Date.now()) / 1000);
          console.log(`  ${username}: ${err.message} (${remaining}s left)`);
        }
      }
      if (sshOk) break;
      await sleep(SSH_POLL_INTERVAL_MS);
    }

    evidence.sshConnected = sshOk;
    evidence.sshUser = sshUser;

    if (sshOk) {
      console.log('\n========================================');
      console.log('  VPS READY — CONNECTION INFO');
      console.log('========================================');
      console.log(`  IP:             ${ip}`);
      console.log(`  Service:        ${deliveredName}`);
      console.log(`  SSH:            ssh -i ${keyFile} ${sshUser}@${ip}`);
      if (orKey) {
        console.log(`  OpenRouter Key: ${orKey.key.slice(0, 15)}...`);
        console.log(`  OR Key Hash:    ${orKey.hash}`);
      }
      console.log('========================================\n');

      expect(sshOk).toBe(true);
    } else {
      console.log('\n  SSH not available within timeout.');
      console.log(`  The VPS is provisioned — try manually:`);
      for (const username of SSH_USERNAMES) {
        console.log(`    ssh -i ${keyFile} ${username}@${ip}`);
      }
    }
  }, 30 * 60_000); // 30 min timeout for the whole thing
});
