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
 * - Use `openclaw onboard --non-interactive --accept-risk --mode local` to bootstrap
 *   config, then `openclaw config set` for schema-validated changes.
 * - OVH VPS hostname (e.g. vps-xxxx.vps.ovh.us) resolves to VPS IP,
 *   so Caddy can auto-provision a Let's Encrypt TLS certificate.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client: SshClient, utils: sshUtils } = require('ssh2');

import Stripe from 'stripe';
import prisma from '../db/client.js';
import * as ovhService from './ovh.service.js';
import * as openRouterService from './openrouter.service.js';
import { getOrCreateStripeCustomer, chargeCustomerOffSession } from '../billing/stripe.service.js';
import { sendOpenClawReadyEmail } from './email.service.js';
import { env } from '../utils/env.js';
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
export const OPENCLAW_PORT = 18789;

// Polling intervals
const ORDER_POLL_INTERVAL_MS = 30_000; // 30s
const ORDER_POLL_TIMEOUT_MS = 20 * 60_000; // 20 min
const REBUILD_POLL_INTERVAL_MS = 15_000; // 15s
const REBUILD_POLL_TIMEOUT_MS = 5 * 60_000; // 5 min
const SSH_RETRY_INTERVAL_MS = 15_000; // 15s
const SSH_RETRY_TIMEOUT_MS = 5 * 60_000; // 5 min
const HEALTH_POLL_INTERVAL_MS = 10_000; // 10s
const HEALTH_POLL_TIMEOUT_MS = 10 * 60_000; // 10 min
const IP_POLL_INTERVAL_MS = 15_000; // 15s
const IP_POLL_TIMEOUT_MS = 3 * 60_000; // 3 min
const VPS_TASKS_POLL_INTERVAL_MS = 15_000; // 15s
const VPS_TASKS_POLL_TIMEOUT_MS = 5 * 60_000; // 5 min
const REBUILD_MAX_RETRIES = 3;
const REBUILD_RETRY_DELAY_MS = 30_000; // 30s

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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    hostname?: string;
    accessToken?: string;
    ovhServiceName?: string;
    ovhOrderId?: string;
    ovhCartId?: string;
    sshPrivateKey?: string;
    sshPublicKey?: string;
    openRouterKeyHash?: string;
    stripeSubscriptionId?: string;
    currentPeriodEnd?: Date;
    canceledAt?: Date;
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

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured');
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

// ============================================================
// SSH Execution
// ============================================================

/**
 * Execute a command on the VPS via SSH.
 * Uses the non-root user (debian) since OVH injects keys there.
 */
export function sshExec(
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
export async function waitForSsh(
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

export function buildSetupScript(openRouterApiKey: string, hostname: string): string {
  // Run as root via sudo. The SSH user is debian (non-root).
  // Key learnings from real VPS testing:
  // - openclaw binary installs to /usr/bin/openclaw (not /usr/local/bin)
  // - `gateway start` uses systemd user services which aren't available on
  //   minimal VPS images. Must use `gateway run` (foreground) with a system
  //   systemd service.
  // - Top-level "model" is not a valid config key. Use openclaw config set
  //   with agents.defaults.model (object with "primary" field).
  // - Use `openclaw onboard --non-interactive --accept-risk --mode local` to create initial
  //   config, then `openclaw config set` for schema-validated changes.
  // - OVH VPS hostname (e.g. vps-xxxx.vps.ovh.us) resolves to the VPS IP,
  //   allowing Caddy to obtain a Let's Encrypt certificate automatically.
  return `sudo -H bash <<'SETUPSCRIPT'
set -euo pipefail
export HOME=/root
cd /root
export DEBIAN_FRONTEND=noninteractive

echo "=== [1/8] System update ==="
apt-get update -qq
apt-get install -y -qq curl caddy ufw python3

echo "=== [2/8] Running OpenClaw installer ==="
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard

echo "=== [3/8] Running OpenClaw onboard ==="
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

echo "=== [4/8] Installing Vincent agent wallet skill ==="
npx --yes clawhub@latest install agentwallet || true
npx --yes clawhub@latest install vincentpolymarket || true

echo "=== [5/8] Configuring OpenClaw ==="
# Set model (agents.defaults.model is an object with "primary" key)
openclaw config set agents.defaults.model --json '{"primary": "openrouter/google/gemini-3-flash-preview"}'

# Additional gateway settings not covered by onboard
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

export async function waitForHealth(
  ipAddress: string,
  hostname?: string,
  timeoutMs: number = HEALTH_POLL_TIMEOUT_MS
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Try HTTPS via Caddy on the hostname (Let's Encrypt cert)
    if (hostname) {
      try {
        const res = await fetch(`https://${hostname}`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          return true;
        }
      } catch {
        // TLS cert may not be ready yet
      }
    }

    // Fallback: direct gateway port via IP
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
// VPS Task Readiness
// ============================================================

const ACTIVE_TASK_STATES = new Set(['todo', 'doing', 'waitingAck', 'init', 'paused']);

/**
 * Wait until the VPS has no active tasks and is in "running" state.
 * OVH rejects rebuild calls while initial installation tasks are still running.
 */
async function waitForVpsReady(
  serviceName: string,
  addLog: (msg: string) => void,
  timeoutMs: number = VPS_TASKS_POLL_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Check VPS state
    const details = await ovhService.getVpsDetails(serviceName);
    if (details.state !== 'running') {
      addLog(`VPS state: ${details.state}, waiting for running...`);
      await sleep(VPS_TASKS_POLL_INTERVAL_MS);
      continue;
    }

    // Check for active tasks
    const taskIds = await ovhService.getVpsTasks(serviceName);
    if (taskIds.length === 0) {
      addLog('VPS ready: no active tasks');
      return;
    }

    let hasActiveTasks = false;
    for (const taskId of taskIds) {
      try {
        const task = await ovhService.getVpsTaskDetails(serviceName, taskId);
        if (ACTIVE_TASK_STATES.has(task.state)) {
          addLog(`VPS task ${taskId}: ${task.type} (${task.state}) — waiting...`);
          hasActiveTasks = true;
          break;
        }
      } catch {
        // Task may have completed between list and detail fetch
      }
    }

    if (!hasActiveTasks) {
      addLog('VPS ready: all tasks completed');
      return;
    }

    await sleep(VPS_TASKS_POLL_INTERVAL_MS);
  }

  throw new Error(`VPS tasks did not complete within ${timeoutMs / 60_000} minutes`);
}

// ============================================================
// Deploy Orchestration
// ============================================================

/**
 * Deploy a new OpenClaw instance. Creates a Stripe Checkout session for
 * the $25/mo subscription. VPS provisioning starts after payment confirmation
 * via webhook (startProvisioning).
 */
export async function deploy(
  userId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ deployment: OpenClawDeployment; checkoutUrl: string }> {
  if (!env.STRIPE_OPENCLAW_PRICE_ID) {
    throw new Error('STRIPE_OPENCLAW_PRICE_ID is not configured');
  }

  // Create deployment record in PENDING_PAYMENT state
  const deployment = await prisma.openClawDeployment.create({
    data: {
      userId,
      status: 'PENDING_PAYMENT',
      statusMessage: 'Awaiting payment',
    },
  });

  // Create Stripe Checkout session
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: env.STRIPE_OPENCLAW_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      deploymentId: deployment.id,
      type: 'openclaw',
    },
  });

  return { deployment, checkoutUrl: session.url! };
}

/**
 * Start VPS provisioning after payment is confirmed via webhook.
 * Called by the checkout.session.completed webhook handler.
 */
export async function startProvisioning(
  deploymentId: string,
  stripeSubscriptionId: string,
  currentPeriodEnd: Date
): Promise<void> {
  // Update deployment with subscription info
  await updateDeployment(deploymentId, {
    status: 'PENDING',
    statusMessage: 'Payment confirmed, starting provisioning',
    stripeSubscriptionId,
    currentPeriodEnd,
  });

  // Start async provisioning (don't await — return immediately)
  provisionAsync(deploymentId, {}).catch(async (err) => {
    console.error(`[openclaw] Provisioning failed for ${deploymentId}:`, err);
    await updateDeployment(deploymentId, {
      status: 'ERROR',
      statusMessage: `Provisioning failed: ${err.message}`,
    }).catch(console.error);
  });
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
      limit: 25, // $25 free credits included with deployment
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

    // Construct the OVH hostname (e.g. vps-xxxx.vps.ovh.us) for Caddy TLS
    const hostname = ovhService.getVpsHostname(deliveredServiceName);
    addLog(`VPS hostname: ${hostname}`);

    await updateDeployment(deploymentId, {
      status: 'PROVISIONING',
      statusMessage: 'VPS delivered, retrieving IP address',
      ovhServiceName: deliveredServiceName,
      hostname,
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

    // Step 7: Wait for VPS tasks to complete before rebuild
    addLog('Waiting for VPS tasks to complete...');
    await waitForVpsReady(deliveredServiceName, addLog);

    // Step 8: Rebuild VPS with SSH key (with retry logic)
    // The initial delivery comes with a random password. We rebuild with
    // publicSshKey + doNotSendPassword to inject our key properly.
    addLog('Rebuilding VPS with SSH key...');
    const rebuildImageId = await findRebuildImage(deliveredServiceName, addLog);

    let rebuildResult: { id: number; state: string; type: string } | undefined;
    for (let attempt = 1; attempt <= REBUILD_MAX_RETRIES; attempt++) {
      try {
        rebuildResult = await ovhService.rebuildVps(deliveredServiceName, rebuildImageId, sshPub);
        addLog(`Rebuild initiated (task: ${rebuildResult.id}, state: ${rebuildResult.state})`);
        break;
      } catch (err: any) {
        const isTaskConflict = err.message?.includes('running tasks');
        if (isTaskConflict && attempt < REBUILD_MAX_RETRIES) {
          addLog(`Rebuild attempt ${attempt} failed (running tasks), retrying in ${REBUILD_RETRY_DELAY_MS / 1000}s...`);
          await sleep(REBUILD_RETRY_DELAY_MS);
        } else {
          throw err;
        }
      }
    }

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
    const setupScript = buildSetupScript(orKey.key, hostname);
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
    const healthy = await waitForHealth(ip, hostname);
    if (healthy) {
      addLog('OpenClaw is healthy and responding!');
    } else {
      addLog('Health check timed out — OpenClaw may still be starting');
    }

    // Mark as READY
    const readyDeployment = await updateDeployment(deploymentId, {
      status: 'READY',
      statusMessage: healthy
        ? 'OpenClaw is live and accessible'
        : 'OpenClaw deployed (health check pending)',
      readyAt: new Date(),
      provisionLog: log,
    });

    // Send ready notification email
    try {
      const user = await prisma.user.findUnique({ where: { id: readyDeployment.userId } });
      if (user?.email && hostname) {
        await sendOpenClawReadyEmail(user.email, deploymentId, hostname);
        addLog(`Ready notification email sent to ${user.email}`);
      }
    } catch (emailErr: any) {
      addLog(`Failed to send ready email: ${emailErr.message}`);
    }

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
async function pollForDelivery(orderId: number, addLog: (msg: string) => void): Promise<string> {
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
async function pollForIp(serviceName: string, addLog: (msg: string) => void): Promise<string> {
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
export async function findRebuildImage(
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
export async function waitForRebuild(
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
 * Destroy a deployment — cancel Stripe subscription, terminate VPS, revoke OpenRouter key.
 */
export async function destroy(deploymentId: string, userId: string): Promise<OpenClawDeployment> {
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
    // Cancel Stripe subscription immediately (no refund)
    if (deployment.stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(deployment.stripeSubscriptionId);
      } catch (err: any) {
        console.error(`[openclaw] Failed to cancel Stripe subscription:`, err);
      }
    }

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
 * Cancel a deployment's subscription at period end.
 * VPS stays running until subscription expires; webhook handles teardown.
 */
export async function cancel(deploymentId: string, userId: string): Promise<OpenClawDeployment> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId },
  });

  if (!deployment) {
    throw new Error('Deployment not found');
  }

  if (!deployment.stripeSubscriptionId) {
    throw new Error('Deployment has no associated subscription');
  }

  if (deployment.status !== 'READY') {
    throw new Error('Can only cancel a READY deployment');
  }

  const stripe = getStripe();
  const sub = await stripe.subscriptions.update(deployment.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  // Extract period end from subscription items (Stripe v2026+ API)
  const firstItem = sub.items?.data?.[0];
  const periodEnd = firstItem
    ? new Date(firstItem.current_period_end * 1000)
    : deployment.currentPeriodEnd;

  return await updateDeployment(deploymentId, {
    status: 'CANCELING',
    statusMessage: `Active until ${periodEnd?.toISOString().split('T')[0] || 'end of billing period'}`,
    canceledAt: new Date(),
    currentPeriodEnd: periodEnd || undefined,
  });
}

/**
 * Handle subscription expiry — called by webhook when Stripe subscription
 * is actually deleted (period ended after cancel_at_period_end).
 */
export async function handleSubscriptionExpired(stripeSubscriptionId: string): Promise<void> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { stripeSubscriptionId },
  });

  if (!deployment) {
    console.log(`[openclaw] No deployment found for subscription ${stripeSubscriptionId}`);
    return;
  }

  if (deployment.status === 'DESTROYED' || deployment.status === 'DESTROYING') {
    return;
  }

  console.log(`[openclaw] Subscription expired for deployment ${deployment.id}, destroying...`);

  await updateDeployment(deployment.id, {
    status: 'DESTROYING',
    statusMessage: 'Subscription expired, destroying deployment',
  });

  try {
    if (deployment.ovhServiceName) {
      try {
        await ovhService.terminateVps(deployment.ovhServiceName);
      } catch (err: any) {
        console.error(`[openclaw] Failed to terminate VPS ${deployment.ovhServiceName}:`, err);
      }
    }

    if (deployment.openRouterKeyHash) {
      try {
        await openRouterService.deleteKey(deployment.openRouterKeyHash);
      } catch (err: any) {
        console.error(`[openclaw] Failed to revoke OpenRouter key:`, err);
      }
    }

    await updateDeployment(deployment.id, {
      status: 'DESTROYED',
      statusMessage: 'Subscription expired, deployment destroyed',
      destroyedAt: new Date(),
    });
  } catch (err: any) {
    console.error(`[openclaw] Destroy after subscription expiry failed:`, err);
    await updateDeployment(deployment.id, {
      status: 'ERROR',
      statusMessage: `Destroy failed: ${err.message}`,
    }).catch(console.error);
  }
}

/**
 * Restart OpenClaw on a deployment's VPS via SSH.
 */
export async function restart(deploymentId: string, userId: string): Promise<OpenClawDeployment> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId, status: { in: ['READY', 'CANCELING'] } },
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

// ============================================================
// Token Billing (LLM Credits)
// ============================================================

const USAGE_POLL_COOLDOWN_MS = 60_000; // Don't re-poll within 60s

/**
 * Get LLM usage stats for a deployment. Polls OpenRouter if stale.
 */
export async function getUsage(
  deploymentId: string,
  userId: string
): Promise<{
  creditBalanceUsd: number;
  totalUsageUsd: number;
  remainingUsd: number;
  usageDailyUsd: number;
  usageMonthlyUsd: number;
  lastPolledAt: Date | null;
}> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId },
  });

  if (!deployment) throw new Error('Deployment not found');
  if (!deployment.openRouterKeyHash) {
    return {
      creditBalanceUsd: Number(deployment.creditBalanceUsd),
      totalUsageUsd: 0,
      remainingUsd: Number(deployment.creditBalanceUsd),
      usageDailyUsd: 0,
      usageMonthlyUsd: 0,
      lastPolledAt: null,
    };
  }

  // Poll OpenRouter if last poll was > 60s ago
  const now = new Date();
  const lastPoll = deployment.lastUsagePollAt;
  const stale = !lastPoll || now.getTime() - lastPoll.getTime() > USAGE_POLL_COOLDOWN_MS;

  let totalUsage = Number(deployment.lastKnownUsageUsd);
  let dailyUsage = 0;
  let monthlyUsage = 0;

  if (stale) {
    try {
      const usage = await openRouterService.getKeyUsage(deployment.openRouterKeyHash);
      totalUsage = usage.usage;
      dailyUsage = usage.usage_daily;
      monthlyUsage = usage.usage_monthly;

      await prisma.openClawDeployment.update({
        where: { id: deploymentId },
        data: {
          lastKnownUsageUsd: totalUsage,
          lastUsagePollAt: now,
        },
      });
    } catch (err) {
      console.error(`[openclaw] Failed to poll OpenRouter usage for ${deploymentId}:`, err);
      // Use cached values on error
    }
  }

  const creditBalance = Number(deployment.creditBalanceUsd);
  return {
    creditBalanceUsd: creditBalance,
    totalUsageUsd: totalUsage,
    remainingUsd: Math.max(0, creditBalance - totalUsage),
    usageDailyUsd: dailyUsage,
    usageMonthlyUsd: monthlyUsage,
    lastPolledAt: deployment.lastUsagePollAt || null,
  };
}

/**
 * Add LLM credits to a deployment by charging the user's Stripe payment method.
 */
export async function addCredits(
  deploymentId: string,
  userId: string,
  amountUsd: number
): Promise<{
  success: boolean;
  newBalanceUsd: number;
  paymentIntentId?: string;
  requiresAction?: boolean;
  clientSecret?: string;
}> {
  if (amountUsd < 5 || amountUsd > 500) {
    throw new Error('Credit amount must be between $5 and $500');
  }

  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId },
  });

  if (!deployment) throw new Error('Deployment not found');
  if (!['READY', 'CANCELING'].includes(deployment.status)) {
    throw new Error('Deployment must be READY to add credits');
  }

  const amountCents = Math.round(amountUsd * 100);
  const result = await chargeCustomerOffSession(
    userId,
    amountCents,
    `OpenClaw LLM credits ($${amountUsd.toFixed(2)})`,
    { deploymentId, type: 'openclaw_credits' }
  );

  if (result.requiresAction) {
    return {
      success: false,
      newBalanceUsd: Number(deployment.creditBalanceUsd),
      requiresAction: true,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
    };
  }

  // Payment succeeded — update credit balance and OpenRouter key limit
  const newBalance = Number(deployment.creditBalanceUsd) + amountUsd;

  await prisma.$transaction([
    prisma.openClawDeployment.update({
      where: { id: deploymentId },
      data: { creditBalanceUsd: newBalance },
    }),
    prisma.openClawCreditPurchase.create({
      data: {
        deploymentId,
        amountUsd,
        stripePaymentIntentId: result.paymentIntentId!,
      },
    }),
  ]);

  // Update OpenRouter key spending limit to match new credit balance
  if (deployment.openRouterKeyHash) {
    try {
      await openRouterService.updateKeyLimit(deployment.openRouterKeyHash, newBalance);
    } catch (err) {
      console.error(`[openclaw] Failed to update OpenRouter key limit:`, err);
    }
  }

  return {
    success: true,
    newBalanceUsd: newBalance,
    paymentIntentId: result.paymentIntentId,
  };
}

// ============================================================
// Retry Failed Deployment
// ============================================================

/**
 * Retry a failed deployment. Cleans up partial resources (OpenRouter key),
 * then re-provisions from scratch using the existing subscription.
 */
export async function retryDeploy(deploymentId: string, userId: string): Promise<OpenClawDeployment> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId },
  });

  if (!deployment) throw new Error('Deployment not found');
  if (deployment.status !== 'ERROR') {
    throw new Error('Can only retry deployments in ERROR state');
  }
  if (!deployment.stripeSubscriptionId) {
    throw new Error('Deployment has no subscription — cannot retry without payment');
  }

  console.log(`[openclaw] Retrying deployment ${deploymentId}...`);

  // Clean up partial OpenRouter key from the failed attempt
  if (deployment.openRouterKeyHash) {
    try {
      await openRouterService.deleteKey(deployment.openRouterKeyHash);
      console.log(`[openclaw] Cleaned up orphaned OpenRouter key ${deployment.openRouterKeyHash}`);
    } catch (err: any) {
      console.error(`[openclaw] Failed to clean up OpenRouter key:`, err.message);
    }
  }

  // Reset deployment state for fresh provisioning
  const updated = await prisma.openClawDeployment.update({
    where: { id: deploymentId },
    data: {
      status: 'PENDING',
      statusMessage: 'Retrying provisioning',
      openRouterKeyHash: null,
      ipAddress: null,
      hostname: null,
      accessToken: null,
      sshPrivateKey: null,
      sshPublicKey: null,
      ovhServiceName: null,
      ovhOrderId: null,
      readyAt: null,
      provisionLog: null,
    },
  });

  // Start async provisioning (reuses existing subscription)
  provisionAsync(deploymentId, {}).catch(async (err) => {
    console.error(`[openclaw] Retry provisioning failed for ${deploymentId}:`, err);
    await updateDeployment(deploymentId, {
      status: 'ERROR',
      statusMessage: `Retry failed: ${err.message}`,
    }).catch(console.error);
  });

  return updated;
}

// ============================================================
// Orphan Cleanup
// ============================================================

/**
 * Clean up orphaned resources from DESTROYED/old-ERROR deployments.
 * - Revoke OpenRouter keys on DESTROYED deployments
 * - Mark abandoned PENDING_PAYMENT checkouts (>24h) as DESTROYED
 */
export async function cleanupOrphanedResources(): Promise<{
  keysRevoked: number;
  abandonedCheckouts: number;
}> {
  let keysRevoked = 0;
  let abandonedCheckouts = 0;

  // 1. Revoke OpenRouter keys on DESTROYED deployments that still have a key hash
  const destroyedWithKeys = await prisma.openClawDeployment.findMany({
    where: {
      status: 'DESTROYED',
      openRouterKeyHash: { not: null },
    },
    select: { id: true, openRouterKeyHash: true },
  });

  for (const d of destroyedWithKeys) {
    try {
      await openRouterService.deleteKey(d.openRouterKeyHash!);
      await prisma.openClawDeployment.update({
        where: { id: d.id },
        data: { openRouterKeyHash: null },
      });
      keysRevoked++;
      console.log(`[openclaw:cleanup] Revoked orphaned key for destroyed deployment ${d.id}`);
    } catch (err: any) {
      console.error(`[openclaw:cleanup] Failed to revoke key for ${d.id}:`, err.message);
    }
  }

  // 2. Mark PENDING_PAYMENT deployments older than 24h as DESTROYED (abandoned checkouts)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const abandonedPayments = await prisma.openClawDeployment.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      createdAt: { lt: twentyFourHoursAgo },
    },
    select: { id: true },
  });

  for (const d of abandonedPayments) {
    try {
      await prisma.openClawDeployment.update({
        where: { id: d.id },
        data: {
          status: 'DESTROYED',
          statusMessage: 'Checkout session expired (abandoned)',
          destroyedAt: new Date(),
        },
      });
      abandonedCheckouts++;
      console.log(`[openclaw:cleanup] Marked abandoned checkout ${d.id} as DESTROYED`);
    } catch (err: any) {
      console.error(`[openclaw:cleanup] Failed to clean up abandoned checkout ${d.id}:`, err.message);
    }
  }

  if (keysRevoked > 0 || abandonedCheckouts > 0) {
    console.log(`[openclaw:cleanup] Cleaned up: ${keysRevoked} orphaned keys, ${abandonedCheckouts} abandoned checkouts`);
  }

  return { keysRevoked, abandonedCheckouts };
}

// ============================================================
// Stale Deployment Timeout
// ============================================================

const PROVISIONING_TIMEOUT_MS = 20 * 60_000;  // 20 min for PENDING/ORDERING
const INSTALLING_TIMEOUT_MS = 30 * 60_000;    // 30 min for PROVISIONING/INSTALLING
const CHECKOUT_TIMEOUT_MS = 60 * 60_000;      // 1 hour for PENDING_PAYMENT

/**
 * Find deployments stuck in intermediate states and mark them ERROR.
 */
export async function checkStaleDeployments(): Promise<number> {
  let timedOut = 0;
  const now = Date.now();

  // PENDING_PAYMENT > 1 hour
  const staleCheckouts = await prisma.openClawDeployment.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      updatedAt: { lt: new Date(now - CHECKOUT_TIMEOUT_MS) },
    },
    select: { id: true },
  });

  // PENDING/ORDERING > 20 min
  const staleOrdering = await prisma.openClawDeployment.findMany({
    where: {
      status: { in: ['PENDING', 'ORDERING'] },
      updatedAt: { lt: new Date(now - PROVISIONING_TIMEOUT_MS) },
    },
    select: { id: true },
  });

  // PROVISIONING/INSTALLING > 30 min
  const staleInstalling = await prisma.openClawDeployment.findMany({
    where: {
      status: { in: ['PROVISIONING', 'INSTALLING'] },
      updatedAt: { lt: new Date(now - INSTALLING_TIMEOUT_MS) },
    },
    select: { id: true },
  });

  const allStale = [
    ...staleCheckouts.map(d => ({ id: d.id, reason: 'Checkout session timed out' })),
    ...staleOrdering.map(d => ({ id: d.id, reason: 'VPS provisioning timed out after 20 minutes' })),
    ...staleInstalling.map(d => ({ id: d.id, reason: 'Installation timed out after 30 minutes' })),
  ];

  for (const { id, reason } of allStale) {
    try {
      await prisma.openClawDeployment.update({
        where: { id },
        data: {
          status: 'ERROR',
          statusMessage: reason,
        },
      });
      timedOut++;
      console.log(`[openclaw:timeout] Deployment ${id}: ${reason}`);
    } catch (err: any) {
      console.error(`[openclaw:timeout] Failed to mark ${id} as timed out:`, err.message);
    }
  }

  if (timedOut > 0) {
    console.log(`[openclaw:timeout] Timed out ${timedOut} stale deployments`);
  }

  return timedOut;
}

// ============================================================
// Health Monitoring
// ============================================================

// Track consecutive health check failures per deployment (in-memory)
const healthFailureCounts = new Map<string, number>();
const HEALTH_FAILURE_THRESHOLD = 3; // Mark unhealthy after 3 consecutive failures

/**
 * Check health of all READY deployments and update status messages.
 */
export async function checkDeploymentHealth(): Promise<{
  checked: number;
  healthy: number;
  unhealthy: number;
}> {
  let checked = 0;
  let healthy = 0;
  let unhealthy = 0;

  const deployments = await prisma.openClawDeployment.findMany({
    where: { status: { in: ['READY', 'CANCELING'] }, ipAddress: { not: null } },
    select: { id: true, ipAddress: true, hostname: true, statusMessage: true },
  });

  for (const d of deployments) {
    checked++;
    let isHealthy = false;

    // Try hostname first, then direct IP
    if (d.hostname) {
      try {
        const res = await fetch(`https://${d.hostname}`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          isHealthy = true;
        }
      } catch {
        // Try direct IP fallback
      }
    }

    if (!isHealthy && d.ipAddress) {
      try {
        const res = await fetch(`http://${d.ipAddress}:${OPENCLAW_PORT}`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          isHealthy = true;
        }
      } catch {
        // Not reachable
      }
    }

    const prevFailures = healthFailureCounts.get(d.id) || 0;

    if (isHealthy) {
      healthy++;
      if (prevFailures > 0) {
        healthFailureCounts.delete(d.id);
        // Restore normal status message if it was showing unhealthy warning
        if (d.statusMessage?.includes('not responding')) {
          await prisma.openClawDeployment.update({
            where: { id: d.id },
            data: { statusMessage: 'OpenClaw is live and accessible' },
          }).catch(console.error);
        }
      }
    } else {
      unhealthy++;
      const newFailures = prevFailures + 1;
      healthFailureCounts.set(d.id, newFailures);

      if (newFailures >= HEALTH_FAILURE_THRESHOLD) {
        await prisma.openClawDeployment.update({
          where: { id: d.id },
          data: {
            statusMessage: `Instance not responding (${newFailures} consecutive failures)`,
          },
        }).catch(console.error);
        console.log(`[openclaw:health] Deployment ${d.id} unhealthy (${newFailures} failures)`);
      }
    }
  }

  // Clean up tracking for deployments that no longer exist
  for (const id of healthFailureCounts.keys()) {
    if (!deployments.find(d => d.id === id)) {
      healthFailureCounts.delete(id);
    }
  }

  return { checked, healthy, unhealthy };
}

// ============================================================
// Unified Hardening Background Worker
// ============================================================

const HARDENING_POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes
let hardeningWorkerTimer: ReturnType<typeof setInterval> | null = null;

async function runHardeningChecks(): Promise<void> {
  try {
    await checkStaleDeployments();
    await cleanupOrphanedResources();
    await checkDeploymentHealth();
  } catch (err) {
    console.error('[openclaw:hardening] Background check error:', err);
  }
}

export function startHardeningWorker(): void {
  if (hardeningWorkerTimer) return;
  console.log('[openclaw] Starting hardening background worker (every 5 min)');
  hardeningWorkerTimer = setInterval(runHardeningChecks, HARDENING_POLL_INTERVAL_MS);
}

export function stopHardeningWorker(): void {
  if (hardeningWorkerTimer) {
    clearInterval(hardeningWorkerTimer);
    hardeningWorkerTimer = null;
    console.log('[openclaw] Hardening background worker stopped');
  }
}

// ============================================================
// Background Usage Poller
// ============================================================

const USAGE_POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes
let usagePollerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Poll OpenRouter usage for all READY deployments and update cached values.
 */
async function pollAllUsage(): Promise<void> {
  try {
    const deployments = await prisma.openClawDeployment.findMany({
      where: { status: 'READY', openRouterKeyHash: { not: null } },
      select: { id: true, openRouterKeyHash: true },
    });

    for (const d of deployments) {
      try {
        const usage = await openRouterService.getKeyUsage(d.openRouterKeyHash!);
        await prisma.openClawDeployment.update({
          where: { id: d.id },
          data: {
            lastKnownUsageUsd: usage.usage,
            lastUsagePollAt: new Date(),
          },
        });
      } catch (err) {
        console.error(`[openclaw] Background poll failed for ${d.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[openclaw] Background usage poll error:', err);
  }
}

/**
 * Start the background usage poller (every 5 minutes).
 */
export function startUsagePoller(): void {
  if (usagePollerTimer) return;
  console.log('[openclaw] Starting background usage poller (every 5 min)');
  usagePollerTimer = setInterval(pollAllUsage, USAGE_POLL_INTERVAL_MS);
}

/**
 * Stop the background usage poller.
 */
export function stopUsagePoller(): void {
  if (usagePollerTimer) {
    clearInterval(usagePollerTimer);
    usagePollerTimer = null;
    console.log('[openclaw] Background usage poller stopped');
  }
}

// ============================================================
// Public Data Sanitization
// ============================================================

export function toPublicData(deployment: OpenClawDeployment) {
  const {
    sshPrivateKey,
    sshPublicKey,
    accessToken,
    openRouterKeyHash,
    ovhOrderId,
    ovhCartId,
    provisionLog,
    ...publicFields
  } = deployment;
  return publicFields;
}
