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
import { getOrCreateStripeCustomer } from '../billing/stripe.service.js';
import { sendOpenClawReadyEmail } from './email.service.js';
import { env } from '../utils/env.js';
import * as secretService from './secret.service.js';
import * as apiKeyService from './apiKey.service.js';
import type { OpenClawDeployment, OpenClawStatus } from '@prisma/client';

// ============================================================
// Constants
// ============================================================

// Plans to try in priority order (NA first, then EU fallbacks)
export const VPS_PLANS_PRIORITY = [
  'vps-2025-model1.LZ',
  'vps-2025-model1-ca',
  'vps-2025-model1',
  'vps-2025-model2-ca',
  'vps-2025-model3-ca',
  'vps-2025-model2',
  'vps-2025-model3',
  // EU plans
  'vps-2025-model1.LZ-eu',
  'vps-2025-model1-eu',
  'vps-2025-model2-eu',
  'vps-2025-model3-eu',
];

const DEFAULT_OS = 'Debian 12';
const REBUILD_IMAGE_NAME = 'Debian 12';
const SSH_USERNAME = 'debian'; // Debian 12 default user
export const OPENCLAW_PORT = 18789;

// Polling intervals
const ORDER_POLL_INTERVAL_MS = 30_000; // 30s
const ORDER_POLL_TIMEOUT_MS = 20 * 60_000; // 20 min
const REBUILD_POLL_INTERVAL_MS = 15_000; // 15s
const REBUILD_POLL_TIMEOUT_MS = 20 * 60_000; // 20 min
const SSH_RETRY_INTERVAL_MS = 15_000; // 15s
const SSH_RETRY_TIMEOUT_MS = 10 * 60_000; // 10 min
const HEALTH_POLL_INTERVAL_MS = 10_000; // 10s
const HEALTH_POLL_TIMEOUT_MS = 10 * 60_000; // 10 min
const IP_POLL_INTERVAL_MS = 15_000; // 15s
const IP_POLL_TIMEOUT_MS = 3 * 60_000; // 3 min
const VPS_TASKS_POLL_INTERVAL_MS = 15_000; // 15s
const VPS_TASKS_POLL_TIMEOUT_MS = 15 * 60_000; // 15 min
const REBUILD_MAX_RETRIES = 3;
const REBUILD_RETRY_DELAY_MS = 30_000; // 30s

// ============================================================
// Errors
// ============================================================

/** Thrown when an OVH rebuild task fails, allowing retry at a higher level. */
class RebuildTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RebuildTaskError';
  }
}

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
    provisionStage?: string | null;
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
    vincentSecretIds?: Record<string, string>;
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

export function buildSetupScript(
  openRouterApiKey: string,
  hostname: string,
  vincentApiKeys?: { dataSourcesKey: string; walletKey: string; polymarketKey: string }
): string {
  // Standalone script to be saved as a file on the VPS and run via nohup.
  // Runs as root. Writes marker files for progress tracking:
  //   /root/.openclaw-setup-started  — written at start
  //   /root/.openclaw-setup-complete — written on success
  //   /root/.openclaw-setup-token    — access token on success
  //   /root/.openclaw-setup-error    — written on failure
  return `#!/bin/bash
set -euo pipefail
trap 'echo "FAILED: line $LINENO: $BASH_COMMAND" > /root/.openclaw-setup-error' ERR
export HOME=/root
cd /root
export DEBIAN_FRONTEND=noninteractive

echo "STARTED" > /root/.openclaw-setup-started

echo "=== [1/8] System update ==="
apt-get update -qq || true
apt-get install -y -qq curl caddy ufw python3

echo "=== [2/8] Running OpenClaw installer ==="
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard

echo "=== [3/8] Running OpenClaw onboard ==="
# Skip onboard if config already exists (idempotent for re-runs)
if [ ! -f /root/.openclaw/openclaw.json ]; then
  openclaw onboard \\
    --non-interactive \\
    --accept-risk \\
    --mode local \\
    --auth-choice openrouter-api-key \\
    --openrouter-api-key '${openRouterApiKey}' \\
    --gateway-bind loopback \\
    --skip-channels \\
    --skip-skills \\
    --skip-health \\
    --skip-ui \\
    --skip-daemon
else
  echo "OpenClaw config already exists, skipping onboard"
fi

echo "=== [4/8] Installing Vincent skills ==="
npx --yes clawhub@latest install --force agentwallet || true
npx --yes clawhub@latest install --force vincentpolymarket || true
npx --yes clawhub@latest install --force vincent-twitter || true
npx --yes clawhub@latest install --force vincent-brave-search || true

echo "=== [5/8] Configuring OpenClaw ==="
# Always set the OpenRouter API key via env config — onboard may have been
# skipped if the installer already created a config file (e.g. via doctor).
openclaw config set env.OPENROUTER_API_KEY '${openRouterApiKey}'

# Also write the key directly to the agent's auth-profiles.json.
# OpenClaw's embedded agent reads API keys from this file, not from
# env.OPENROUTER_API_KEY. When onboard is skipped (config already exists),
# auth-profiles.json retains the old/revoked key and agent calls fail 401.
AUTH_PROFILES_DIR="/root/.openclaw/agents/main/agent"
AUTH_PROFILES_FILE="\${AUTH_PROFILES_DIR}/auth-profiles.json"
mkdir -p "\${AUTH_PROFILES_DIR}"
if [ -f "\${AUTH_PROFILES_FILE}" ]; then
  python3 -c "
import json
with open('\${AUTH_PROFILES_FILE}') as f:
    ap = json.load(f)
ap.setdefault('profiles', {})
ap['profiles']['openrouter:default'] = {
    'type': 'api_key',
    'provider': 'openrouter',
    'key': '${openRouterApiKey}'
}
ap['lastGood'] = {'openrouter': 'openrouter:default'}
with open('\${AUTH_PROFILES_FILE}', 'w') as f:
    json.dump(ap, f, indent=2)
print('Updated auth-profiles.json with new OpenRouter key')
"
else
  cat > "\${AUTH_PROFILES_FILE}" << AUTHEOF
{
  "version": 1,
  "profiles": {
    "openrouter:default": {
      "type": "api_key",
      "provider": "openrouter",
      "key": "${openRouterApiKey}"
    }
  },
  "lastGood": {
    "openrouter": "openrouter:default"
  },
  "usageStats": {}
}
AUTHEOF
  chmod 600 "\${AUTH_PROFILES_FILE}"
  echo "Created auth-profiles.json with OpenRouter key"
fi

# Set model (agents.defaults.model is an object with "primary" key)
openclaw config set agents.defaults.model --json '{"primary": "${env.OPENCLAW_DEFAULT_MODEL}"}'

# Additional gateway settings not covered by onboard
openclaw config set gateway.controlUi.allowInsecureAuth true
openclaw config set gateway.trustedProxies --json '["127.0.0.1/32", "::1/128"]'

${
  vincentApiKeys
    ? `
echo "=== [5.5/8] Writing Vincent API credentials ==="
mkdir -p /root/.openclaw/credentials/agentwallet
cat > /root/.openclaw/credentials/agentwallet/default.json << KEYEOF
{"apiKey": "${vincentApiKeys.walletKey}", "host": "https://heyvincent.ai"}
KEYEOF

mkdir -p /root/.openclaw/credentials/vincentpolymarket
cat > /root/.openclaw/credentials/vincentpolymarket/default.json << KEYEOF
{"apiKey": "${vincentApiKeys.polymarketKey}", "host": "https://heyvincent.ai"}
KEYEOF

mkdir -p /root/.openclaw/credentials/vincentdata
cat > /root/.openclaw/credentials/vincentdata/default.json << KEYEOF
{"apiKey": "${vincentApiKeys.dataSourcesKey}", "host": "https://heyvincent.ai"}
KEYEOF
chmod 600 /root/.openclaw/credentials/*/default.json
echo "Vincent credentials written"
`
    : '# No Vincent API keys provided — skills will self-provision'
}
# UNCOMMENT-TO-DO-TRADE-MANAGER-AUTOINSTALL — trade manager not yet ready for production
# echo "=== [6/9] Installing Trade Manager ==="
# npm install -g @openclaw/trade-manager || true
#
# mkdir -p /root/.openclaw
# cat > /root/.openclaw/trade-manager.json << TRADEMANAGEREOF
# {
#   "port": 19000,
#   "pollIntervalSeconds": 15,
#   "vincentApiUrl": "https://heyvincent.ai",
#   "vincentApiKey": "${vincentApiKeys?.polymarketKey ?? ''}",
#   "databaseUrl": "file:/root/.openclaw/trade-manager.db"
# }
# TRADEMANAGEREOF
#
# cat > /etc/systemd/system/openclaw-trade-manager.service << TRADEMANAGERUNIT
# [Unit]
# Description=OpenClaw Trade Manager
# After=network.target
#
# [Service]
# Type=simple
# ExecStart=/usr/bin/env trade-manager start
# Restart=always
# RestartSec=5
# Environment=NODE_ENV=production
# WorkingDirectory=/root
#
# [Install]
# WantedBy=multi-user.target
# TRADEMANAGERUNIT
#
# systemctl daemon-reload
# systemctl enable openclaw-trade-manager || true
# systemctl stop openclaw-trade-manager 2>/dev/null || true
# systemctl start openclaw-trade-manager || true
# systemctl is-active --quiet openclaw-trade-manager || echo "Trade Manager failed to start"

echo "=== [6/8] Configuring Caddy reverse proxy (HTTPS via ${hostname}) ==="
cat > /etc/caddy/Caddyfile << CADDYEOF
${hostname} {
    reverse_proxy localhost:${OPENCLAW_PORT} {
        header_down -Content-Security-Policy
        header_down -X-Frame-Options
    }
    header Content-Security-Policy "frame-ancestors 'self' https://*.heyvincent.ai https://heyvincent.ai"
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

# Extract access token and write marker files
ACCESS_TOKEN=$(openclaw config get gateway.auth.token 2>/dev/null || echo "")
echo "\${ACCESS_TOKEN}" > /root/.openclaw-setup-token
rm -f /root/.openclaw-setup-error
echo "COMPLETE" > /root/.openclaw-setup-complete

echo "=== Setup complete ==="`;
}

// ============================================================
// Detached Setup Execution
// ============================================================

const SETUP_POLL_INTERVAL_MS = 30_000; // 30s
const SETUP_POLL_TIMEOUT_MS = 20 * 60_000; // 20 min

/**
 * Upload and launch the setup script on the VPS in detached mode (nohup).
 * The script runs independently of the SSH session — survives disconnection.
 */
async function launchSetupScript(
  host: string,
  username: string,
  privateKey: string,
  script: string,
  addLog: (msg: string) => void
): Promise<void> {
  // Base64-encode the script and upload it
  const b64 = Buffer.from(script).toString('base64');
  addLog('Uploading setup script to VPS...');
  await sshExec(
    host,
    username,
    privateKey,
    `echo '${b64}' | base64 -d | sudo tee /root/openclaw-setup.sh > /dev/null && sudo chmod +x /root/openclaw-setup.sh`,
    30_000
  );
  addLog('Setup script uploaded');

  // Launch detached via nohup — redirect must happen INSIDE sudo's shell,
  // otherwise the debian user's shell tries to open /root/openclaw-setup.log
  // and fails with Permission denied (debian can't write to /root/).
  addLog('Launching setup script (detached)...');
  await sshExec(
    host,
    username,
    privateKey,
    `sudo bash -c 'nohup bash /root/openclaw-setup.sh > /root/openclaw-setup.log 2>&1 &'`,
    15_000
  );
  addLog('Setup script launched in background on VPS');
}

/**
 * Poll the VPS for setup completion via SSH marker files.
 * Returns the access token on success, throws on failure/timeout.
 */
async function pollSetupCompletion(
  host: string,
  username: string,
  privateKey: string,
  addLog: (msg: string) => void
): Promise<string> {
  const deadline = Date.now() + SETUP_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(SETUP_POLL_INTERVAL_MS);

    // Check for completion first — a transient error (e.g. apt-get update)
    // may write the error marker even though the script recovers and finishes.
    try {
      const completeResult = await sshExec(
        host,
        username,
        privateKey,
        'sudo cat /root/.openclaw-setup-complete 2>/dev/null',
        15_000
      );
      if (completeResult.stdout.trim() === 'COMPLETE') {
        // Read the access token
        const tokenResult = await sshExec(
          host,
          username,
          privateKey,
          'sudo cat /root/.openclaw-setup-token 2>/dev/null',
          15_000
        );
        const token = tokenResult.stdout.trim();
        addLog(`Setup complete, token: ${token ? token.slice(0, 10) + '...' : 'empty'}`);
        return token;
      }
    } catch {
      // SSH error — transient, will retry
    }

    // Check for error (only if not complete)
    try {
      const errorResult = await sshExec(
        host,
        username,
        privateKey,
        'sudo cat /root/.openclaw-setup-error 2>/dev/null',
        15_000
      );
      if (errorResult.stdout.trim()) {
        throw new Error(`Setup script failed: ${errorResult.stdout.trim()}`);
      }
    } catch (err: any) {
      if (err.message?.startsWith('Setup script failed:')) throw err;
      // SSH error — transient, will retry
    }

    const remaining = Math.round((deadline - Date.now()) / 60_000);
    addLog(`Setup still running, ~${remaining} min remaining...`);
  }

  throw new Error(`Setup script did not complete within ${SETUP_POLL_TIMEOUT_MS / 60_000} minutes`);
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
 * Claim the oldest VPS from the pool. Returns the OVH service name, or null if the pool is empty.
 */
async function claimPoolVps(): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ ovh_service_name: string }>>`
    DELETE FROM "vps_pool"
    WHERE "id" = (
      SELECT "id" FROM "vps_pool"
      ORDER BY "created_at" LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "ovh_service_name"
  `;
  return rows.length > 0 ? rows[0].ovh_service_name : null;
}

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

  throw new Error(
    'No VPS plans available — all plans are out of stock in their allowed datacenters'
  );
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
  const startTime = Date.now();

  while (Date.now() < deadline) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // Check VPS state
    const details = await ovhService.getVpsDetails(serviceName);
    if (details.state !== 'running') {
      addLog(`[${elapsed}s] VPS state: ${details.state}, waiting for running...`);
      await sleep(VPS_TASKS_POLL_INTERVAL_MS);
      continue;
    }

    // Check for active tasks
    const taskIds = await ovhService.getVpsTasks(serviceName);
    if (taskIds.length === 0) {
      addLog(`[${elapsed}s] VPS ready: no active tasks`);
      return;
    }

    let hasActiveTasks = false;
    for (const taskId of taskIds) {
      try {
        const task = await ovhService.getVpsTaskDetails(serviceName, taskId);
        if (ACTIVE_TASK_STATES.has(task.state)) {
          addLog(`[${elapsed}s] VPS task ${taskId}: ${task.type} (${task.state}) — waiting...`);
          hasActiveTasks = true;
          break;
        }
      } catch {
        // Task may have completed between list and detail fetch
      }
    }

    if (!hasActiveTasks) {
      addLog(`[${elapsed}s] VPS ready: all tasks completed`);
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

  // Check if user has ever had an OpenClaw deployment (any status) — free trial is for first deployment only
  const existingDeployments = await prisma.openClawDeployment.count({
    where: { userId },
  });
  const isFirstDeployment = existingDeployments === 0;

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
    allow_promotion_codes: true,
    line_items: [{ price: env.STRIPE_OPENCLAW_PRICE_ID, quantity: 1 }],
    subscription_data: isFirstDeployment ? { trial_period_days: 7 } : {},
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
 * Provision stages — tracked in DB for resumability across Railway restarts.
 * Each stage is idempotent: safe to re-run if interrupted.
 */
const PROVISION_STAGES = [
  'ssh_key_generated',
  'secrets_created',
  'openrouter_key_created',
  'plan_found',
  'vps_ordered',
  'vps_delivered',
  'vps_ip_acquired',
  'vps_rebuilt',
  'ssh_ready',
  'setup_script_launched',
  'setup_complete',
] as const;

type ProvisionStage = (typeof PROVISION_STAGES)[number];

/**
 * Async provisioning job — runs in the background after deploy() returns.
 * Stage-based: reads provisionStage from DB and resumes from the next stage.
 */
async function provisionAsync(deploymentId: string, options: DeployOptions): Promise<void> {
  const deployment = await prisma.openClawDeployment.findUnique({ where: { id: deploymentId } });
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  let log = deployment.provisionLog || '';

  const addLog = (msg: string) => {
    console.log(`[openclaw:${deploymentId}] ${msg}`);
    log = appendLog(log, msg);
  };

  const completedStage = deployment.provisionStage as ProvisionStage | null;
  const startIndex = completedStage ? PROVISION_STAGES.indexOf(completedStage) + 1 : 0;

  if (startIndex > 0) {
    addLog(
      `Resuming from stage: ${completedStage} (next: ${PROVISION_STAGES[startIndex] || 'done'})`
    );
  }

  // In-memory context accumulated across stages (populated from DB on resume)
  const ctx: {
    sshPub?: string;
    sshPriv?: string;
    orKeyHash?: string;
    orKeyRaw?: string;
    planCode?: string;
    datacenter?: string;
    serviceName?: string;
    hostname?: string;
    ip?: string;
    sshUser?: string;
    accessToken?: string;
    vincentApiKeys?: { dataSourcesKey: string; walletKey: string; polymarketKey: string };
  } = {
    sshPub: deployment.sshPublicKey || undefined,
    sshPriv: deployment.sshPrivateKey || undefined,
    orKeyHash: deployment.openRouterKeyHash || undefined,
    serviceName: deployment.ovhServiceName || undefined,
    hostname: deployment.hostname || undefined,
    ip: deployment.ipAddress || undefined,
    accessToken: deployment.accessToken || undefined,
  };

  try {
    for (let i = startIndex; i < PROVISION_STAGES.length; i++) {
      const stage = PROVISION_STAGES[i];

      switch (stage) {
        case 'ssh_key_generated': {
          if (!ctx.sshPub || !ctx.sshPriv) {
            addLog('Generating RSA 4096 SSH key pair...');
            const { publicKey, privateKey } = generateSshKeyPair();
            ctx.sshPub = publicKey;
            ctx.sshPriv = privateKey;
            addLog(`SSH key generated (${publicKey.slice(0, 40)}...)`);
          }
          await updateDeployment(deploymentId, {
            sshPublicKey: ctx.sshPub,
            sshPrivateKey: ctx.sshPriv,
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'secrets_created': {
          // Pre-create and claim DATA_SOURCES, EVM_WALLET, POLYMARKET_WALLET secrets
          const existingSecretIds = (deployment.vincentSecretIds as Record<string, string>) || {};
          if (
            existingSecretIds.dataSourcesSecretId &&
            existingSecretIds.walletSecretId &&
            existingSecretIds.polymarketSecretId
          ) {
            addLog('Vincent secrets already exist, skipping creation');
            // On resume we can't recover the plain API keys from the DB,
            // so we generate new ones for each secret
            const secretTypes = [
              { key: 'dataSourcesSecretId', ctxKey: 'dataSourcesKey' as const },
              { key: 'walletSecretId', ctxKey: 'walletKey' as const },
              { key: 'polymarketSecretId', ctxKey: 'polymarketKey' as const },
            ] as const;
            const keys: Record<string, string> = {};
            for (const { key, ctxKey } of secretTypes) {
              const { plainKey } = await apiKeyService.createApiKey({
                secretId: existingSecretIds[key],
                name: 'OpenClaw Pre-provisioned (resumed)',
              });
              keys[ctxKey] = plainKey;
            }
            ctx.vincentApiKeys = {
              dataSourcesKey: keys.dataSourcesKey,
              walletKey: keys.walletKey,
              polymarketKey: keys.polymarketKey,
            };
          } else {
            addLog('Creating and claiming Vincent secrets...');
            const secretConfigs = [
              {
                type: 'DATA_SOURCES' as const,
                memo: 'OpenClaw Data Sources',
                ctxKey: 'dataSourcesKey' as const,
                idKey: 'dataSourcesSecretId',
              },
              {
                type: 'EVM_WALLET' as const,
                memo: 'OpenClaw Wallet',
                ctxKey: 'walletKey' as const,
                idKey: 'walletSecretId',
              },
              {
                type: 'POLYMARKET_WALLET' as const,
                memo: 'OpenClaw Polymarket',
                ctxKey: 'polymarketKey' as const,
                idKey: 'polymarketSecretId',
              },
            ];
            const secretIds: Record<string, string> = {};
            const keys: Record<string, string> = {};

            for (const cfg of secretConfigs) {
              const { secret, claimToken } = await secretService.createSecret({
                type: cfg.type,
                memo: cfg.memo,
              });
              // Auto-claim to the deploying user
              await secretService.claimSecret({
                secretId: secret.id,
                claimToken,
                userId: deployment.userId,
              });
              // Generate API key
              const { plainKey } = await apiKeyService.createApiKey({
                secretId: secret.id,
                name: 'OpenClaw Pre-provisioned',
              });
              secretIds[cfg.idKey] = secret.id;
              keys[cfg.ctxKey] = plainKey;
              addLog(`Created ${cfg.type} secret (${secret.id})`);
            }

            ctx.vincentApiKeys = {
              dataSourcesKey: keys.dataSourcesKey,
              walletKey: keys.walletKey,
              polymarketKey: keys.polymarketKey,
            };

            await updateDeployment(deploymentId, {
              vincentSecretIds: secretIds,
            });
          }
          await updateDeployment(deploymentId, {
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'openrouter_key_created': {
          if (!ctx.orKeyHash) {
            addLog('Provisioning OpenRouter API key...');
            const shortId = deploymentId.slice(-8);
            const orKey = await openRouterService.createKey(`openclaw-${shortId}`, {
              limit: 25,
            });
            ctx.orKeyHash = orKey.hash;
            ctx.orKeyRaw = orKey.key;
            addLog(`OpenRouter key created (hash: ${orKey.hash})`);
          }
          await updateDeployment(deploymentId, {
            openRouterKeyHash: ctx.orKeyHash,
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'plan_found': {
          // Try to claim a pre-provisioned VPS from the pool first.
          if (!ctx.serviceName) {
            addLog('Checking VPS pool...');
            const poolVps = await claimPoolVps();
            if (poolVps) {
              ctx.serviceName = poolVps;
              ctx.hostname = ovhService.getVpsHostname(poolVps);
              addLog(`Claimed VPS from pool: ${poolVps}`);
              await updateDeployment(deploymentId, {
                ovhServiceName: ctx.serviceName,
                hostname: ctx.hostname,
                provisionLog: log,
                provisionStage: stage,
              });
              break;
            }
            addLog('VPS pool empty, proceeding with normal VPS ordering');
          } else {
            addLog(`VPS already claimed for this deployment: ${ctx.serviceName}`);
          }

          // Pool empty — proceed with normal plan finding
          const planCode = options.planCode;
          const datacenter = options.datacenter;
          if (!planCode || !datacenter) {
            addLog('Finding available VPS plan + datacenter...');
            const found = await findAvailablePlanAndDc();
            ctx.planCode = planCode || found.planCode;
            ctx.datacenter = datacenter || found.datacenter;
            addLog(`Found: ${ctx.planCode} @ ${ctx.datacenter}`);
          } else {
            ctx.planCode = planCode;
            ctx.datacenter = datacenter;
          }
          await updateDeployment(deploymentId, {
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'vps_ordered': {
          // Pool-sourced VPS: skip ordering entirely
          if (ctx.serviceName) {
            addLog(`VPS from pool (${ctx.serviceName}), skipping order`);
            await updateDeployment(deploymentId, {
              ovhServiceName: ctx.serviceName,
              hostname: ctx.hostname,
              provisionLog: log,
              provisionStage: stage,
            });
            break;
          }

          // Reload from DB in case we're resuming and order already placed
          const current = await prisma.openClawDeployment.findUnique({
            where: { id: deploymentId },
          });
          if (current?.ovhOrderId) {
            addLog(`VPS order already placed (orderId: ${current.ovhOrderId}), skipping`);
          } else {
            const os = options.os || DEFAULT_OS;
            const planCode = ctx.planCode || VPS_PLANS_PRIORITY[0];
            const datacenter = ctx.datacenter || 'US-EAST-LZ-MIA';
            addLog(`Ordering VPS (plan: ${planCode}, dc: ${datacenter}, os: ${os})...`);
            await updateDeployment(deploymentId, {
              status: 'ORDERING',
              statusMessage: 'Deploying agent server',
              provisionLog: log,
            });

            const order = await ovhService.orderVps({ planCode, datacenter, os });
            addLog(`VPS order placed (orderId: ${order.orderId})`);

            await updateDeployment(deploymentId, {
              ovhOrderId: String(order.orderId),
              provisionLog: log,
            });
          }
          await updateDeployment(deploymentId, {
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'vps_delivered': {
          if (!ctx.serviceName) {
            const current = await prisma.openClawDeployment.findUnique({
              where: { id: deploymentId },
            });
            const orderId = Number(current?.ovhOrderId);
            if (!orderId) throw new Error('No order ID found for delivery polling');

            addLog('Waiting for VPS delivery...');

            // Retry loop: if another deployment claims the VPS first (unique constraint),
            // keep polling until we find our own VPS.
            let claimed = false;
            while (!claimed) {
              const deliveredServiceName = await pollForDelivery(orderId, addLog);
              try {
                await updateDeployment(deploymentId, {
                  ovhServiceName: deliveredServiceName,
                });
                ctx.serviceName = deliveredServiceName;
                claimed = true;
                addLog(`VPS delivered: ${deliveredServiceName}`);
              } catch (err: any) {
                if (err.code === 'P2002' && err.meta?.target?.includes('ovh_service_name')) {
                  addLog(
                    `VPS ${deliveredServiceName} already claimed by another deployment, retrying...`
                  );
                  continue;
                }
                throw err;
              }
            }
          }

          ctx.hostname = ovhService.getVpsHostname(ctx.serviceName!);
          addLog(`VPS hostname: ${ctx.hostname}`);

          await updateDeployment(deploymentId, {
            status: 'PROVISIONING',
            statusMessage: 'VPS delivered, retrieving IP address',
            hostname: ctx.hostname,
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'vps_ip_acquired': {
          if (!ctx.serviceName) throw new Error('No service name for IP retrieval');
          if (!ctx.ip) {
            addLog('Retrieving VPS IP address...');
            ctx.ip = await pollForIp(ctx.serviceName, addLog);
            addLog(`VPS IP: ${ctx.ip}`);
          }
          await updateDeployment(deploymentId, {
            ipAddress: ctx.ip,
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'vps_rebuilt': {
          if (!ctx.serviceName || !ctx.sshPub) {
            throw new Error('Missing service name or SSH public key for rebuild');
          }

          // Retry loop: covers both the rebuild API call AND waiting for completion,
          // so we can recover from OVH-side rebuild failures (task state=error).
          for (let rebuildAttempt = 1; rebuildAttempt <= REBUILD_MAX_RETRIES; rebuildAttempt++) {
            try {
              let rebuildTaskId: number | undefined;

              // Check if a rebuild is already in progress (e.g. retry after timeout)
              const currentDetails = await ovhService.getVpsDetails(ctx.serviceName);
              addLog(
                `[rebuild attempt ${rebuildAttempt}/${REBUILD_MAX_RETRIES}] VPS current state: ${currentDetails.state}`
              );

              if (currentDetails.state === 'installing') {
                // A rebuild is already in progress — skip initiating a new one
                addLog(
                  'Rebuild already in progress (VPS is installing), waiting for completion...'
                );
              } else if (currentDetails.state === 'maintenance') {
                // VPS stuck in maintenance from a previous failed rebuild — need a fresh rebuild
                addLog(
                  'VPS in maintenance (previous rebuild likely failed), waiting for it to recover...'
                );
                await waitForVpsReady(ctx.serviceName, addLog);
                rebuildTaskId = await initiateRebuild(ctx.serviceName, ctx.sshPub, addLog);
              } else {
                addLog('Waiting for VPS tasks to complete...');
                await waitForVpsReady(ctx.serviceName, addLog);
                rebuildTaskId = await initiateRebuild(ctx.serviceName, ctx.sshPub, addLog);
              }

              await waitForRebuild(ctx.serviceName, addLog, rebuildTaskId);
              break; // Rebuild succeeded
            } catch (err) {
              if (err instanceof RebuildTaskError && rebuildAttempt < REBUILD_MAX_RETRIES) {
                addLog(
                  `Rebuild attempt ${rebuildAttempt} failed on OVH side, retrying in ${REBUILD_RETRY_DELAY_MS / 1000}s...`
                );
                await sleep(REBUILD_RETRY_DELAY_MS);
              } else {
                throw err;
              }
            }
          }

          addLog('Rebuild complete, waiting 30s for SSH to come up...');
          await sleep(30_000);

          await updateDeployment(deploymentId, {
            statusMessage: 'VPS rebuilt with SSH key, connecting...',
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'ssh_ready': {
          if (!ctx.ip || !ctx.sshPriv) throw new Error('Missing IP or SSH key for SSH');

          addLog('Waiting for SSH access...');
          await updateDeployment(deploymentId, {
            status: 'INSTALLING',
            statusMessage: 'Connecting to VPS and installing OpenClaw',
            provisionLog: log,
          });

          ctx.sshUser = await waitForSsh(ctx.ip, ctx.sshPriv);
          addLog(`SSH connected as ${ctx.sshUser}`);

          await updateDeployment(deploymentId, {
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'setup_script_launched': {
          if (!ctx.ip || !ctx.sshPriv || !ctx.hostname) {
            throw new Error('Missing IP, SSH key, or hostname for setup');
          }
          // Determine SSH user (may need to re-detect on resume)
          if (!ctx.sshUser) {
            ctx.sshUser = await waitForSsh(ctx.ip, ctx.sshPriv);
          }

          // Get the OpenRouter key — on resume we need to read it from
          // the OpenRouter API since we only store the hash in DB
          if (!ctx.orKeyRaw) {
            // We can't recover the raw key from the hash. But if we're
            // resuming at this stage, the script hasn't been launched yet,
            // so the key must still be needed. Create a new one and clean
            // up the old one.
            addLog('Reprovisioning OpenRouter API key for setup script...');
            const current = await prisma.openClawDeployment.findUnique({
              where: { id: deploymentId },
            });
            if (current?.openRouterKeyHash) {
              try {
                await openRouterService.deleteKey(current.openRouterKeyHash);
              } catch (err) {
                // Best-effort cleanup: the old key may already be deleted or the
                // OpenRouter API may be temporarily down. Either way we proceed
                // with creating a fresh key — the stale one will just expire.
                addLog(
                  `[warn] Failed to delete old OpenRouter key (hash: ${current.openRouterKeyHash}): ${err}`
                );
              }
            }
            const shortId = deploymentId.slice(-8);
            const orKey = await openRouterService.createKey(`openclaw-${shortId}`, { limit: 25 });
            ctx.orKeyRaw = orKey.key;
            ctx.orKeyHash = orKey.hash;
            await updateDeployment(deploymentId, { openRouterKeyHash: orKey.hash });
            addLog(`New OpenRouter key created (hash: ${orKey.hash})`);
          }

          // Recover Vincent API keys on resume (plain keys aren't stored in DB)
          if (!ctx.vincentApiKeys) {
            const current = await prisma.openClawDeployment.findUnique({
              where: { id: deploymentId },
            });
            const secretIds = (current?.vincentSecretIds as Record<string, string>) || {};
            if (
              secretIds.dataSourcesSecretId &&
              secretIds.walletSecretId &&
              secretIds.polymarketSecretId
            ) {
              addLog('Generating new Vincent API keys for resumed setup...');
              const keys: Record<string, string> = {};
              for (const [idKey, ctxKey] of [
                ['dataSourcesSecretId', 'dataSourcesKey'],
                ['walletSecretId', 'walletKey'],
                ['polymarketSecretId', 'polymarketKey'],
              ] as const) {
                const { plainKey } = await apiKeyService.createApiKey({
                  secretId: secretIds[idKey],
                  name: 'OpenClaw Pre-provisioned (resumed)',
                });
                keys[ctxKey] = plainKey;
              }
              ctx.vincentApiKeys = {
                dataSourcesKey: keys.dataSourcesKey,
                walletKey: keys.walletKey,
                polymarketKey: keys.polymarketKey,
              };
            }
          }

          addLog('Launching OpenClaw setup script (detached)...');
          const setupScript = buildSetupScript(ctx.orKeyRaw, ctx.hostname, ctx.vincentApiKeys);
          await launchSetupScript(ctx.ip, ctx.sshUser, ctx.sshPriv, setupScript, addLog);

          await updateDeployment(deploymentId, {
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }

        case 'setup_complete': {
          if (!ctx.ip || !ctx.sshPriv) throw new Error('Missing IP or SSH key for poll');
          if (!ctx.sshUser) {
            ctx.sshUser = await waitForSsh(ctx.ip, ctx.sshPriv);
          }

          addLog('Polling for setup completion...');
          const token = await pollSetupCompletion(ctx.ip, ctx.sshUser, ctx.sshPriv, addLog);
          ctx.accessToken = token;

          await updateDeployment(deploymentId, {
            accessToken: token || undefined,
            provisionLog: log,
            provisionStage: stage,
          });
          break;
        }
      }
    }

    // All stages complete — health check and mark READY
    addLog('Waiting for OpenClaw health check...');
    const healthy = await waitForHealth(ctx.ip!, ctx.hostname);
    if (healthy) {
      addLog('OpenClaw is healthy and responding!');
    } else {
      addLog('Health check timed out — OpenClaw may still be starting');
    }

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
      if (user?.email && ctx.hostname) {
        await sendOpenClawReadyEmail(user.email, deploymentId, ctx.hostname);
        addLog(`Ready notification email sent to ${user.email}`);
      }
    } catch (emailErr: any) {
      addLog(`Failed to send ready email: ${emailErr.message}`);
    }

    // Apply any pending referral rewards for this user
    try {
      const { applyPendingRewards } = await import('./referral.service.js');
      const applied = await applyPendingRewards(readyDeployment.userId);
      if (applied > 0) {
        addLog(`Applied ${applied} pending referral reward(s)`);
      }
    } catch (refErr: any) {
      addLog(`Failed to apply referral rewards: ${refErr.message}`);
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
 * Primarily uses getOrderAssociatedService (works on resume without in-memory
 * snapshot), with VPS list comparison as a secondary check.
 */
async function pollForDelivery(orderId: number, addLog: (msg: string) => void): Promise<string> {
  const deadline = Date.now() + ORDER_POLL_TIMEOUT_MS;

  // Snapshot current VPS list for diff-based detection (fallback)
  let vpsBefore: Set<string>;
  try {
    vpsBefore = new Set(await ovhService.listVps());
    addLog(`Existing VPS count: ${vpsBefore.size}`);
  } catch {
    vpsBefore = new Set();
  }

  while (Date.now() < deadline) {
    await sleep(ORDER_POLL_INTERVAL_MS);

    // Primary: check order's associated service (works on resume)
    try {
      const serviceName = await ovhService.getOrderAssociatedService(orderId);
      if (serviceName && serviceName.startsWith('vps')) {
        return serviceName;
      }
    } catch (err: any) {
      addLog(`Order association check error: ${err.message}`);
    }

    // Secondary: check if a new VPS appeared in the list
    try {
      const vpsNow = await ovhService.listVps();
      const newVpses = vpsNow.filter((name) => !vpsBefore.has(name));
      if (newVpses.length > 0) {
        // Exclude VPSes already claimed by other deployments
        const claimed = await prisma.openClawDeployment.findMany({
          where: { ovhServiceName: { in: newVpses } },
          select: { ovhServiceName: true },
        });
        const claimedSet = new Set(claimed.map((d) => d.ovhServiceName));
        const unclaimed = newVpses.filter((name) => !claimedSet.has(name));
        if (unclaimed.length > 0) {
          return unclaimed[0];
        }
      }
    } catch (err) {
      // VPS list API can 404 or timeout while the order is still being
      // processed by OVH. We keep polling — the next iteration will retry.
      addLog(`[warn] Failed to list VPS while waiting for delivery: ${err}`);
    }

    // Log order status
    try {
      const orderStatus = await ovhService.getOrderStatus(orderId);
      const elapsed = Math.round((Date.now() + ORDER_POLL_TIMEOUT_MS - deadline) / 1000);
      addLog(
        `[${elapsed}s] Order ${orderId} step: ${orderStatus.step}, status: ${orderStatus.status}`
      );
    } catch (err) {
      // Order status endpoint may return 404 briefly after placement.
      // Non-fatal — we continue polling until the deadline.
      addLog(`[warn] Failed to fetch order status for ${orderId}: ${err}`);
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
    } catch (err) {
      // IP assignment can lag behind VPS delivery — the OVH API may 404 or
      // return an empty result for a short window. We retry until the deadline.
      addLog(`[warn] getVpsIps failed for ${serviceName} (attempt ${attempt + 1}): ${err}`);
    }

    // Fallback to getVpsDetails
    try {
      const details = await ovhService.getVpsDetails(serviceName);
      if (details.ips && details.ips.length > 0) {
        return details.ips.find(isIpv4) || details.ips[0];
      }
    } catch (err) {
      // Same as above — VPS details may not be queryable yet right after delivery.
      addLog(`[warn] getVpsDetails failed for ${serviceName} (attempt ${attempt + 1}): ${err}`);
    }

    addLog(`Waiting for IP (attempt ${attempt + 1})...`);
    await sleep(IP_POLL_INTERVAL_MS);
  }

  throw new Error(`Could not retrieve IP for ${serviceName}`);
}

/**
 * Initiate a VPS rebuild, retrying on "running tasks" conflicts.
 * Returns the OVH task ID for the rebuild.
 */
async function initiateRebuild(
  serviceName: string,
  sshPub: string,
  addLog: (msg: string) => void
): Promise<number> {
  addLog('Rebuilding VPS with SSH key...');
  const rebuildImageId = await findRebuildImage(serviceName, addLog);

  for (let attempt = 1; attempt <= REBUILD_MAX_RETRIES; attempt++) {
    try {
      const rebuildResult = await ovhService.rebuildVps(serviceName, rebuildImageId, sshPub);
      addLog(`Rebuild initiated (task: ${rebuildResult.id}, state: ${rebuildResult.state})`);
      return rebuildResult.id;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isTaskConflict = message.includes('running tasks');
      if (isTaskConflict && attempt < REBUILD_MAX_RETRIES) {
        addLog(
          `Rebuild attempt ${attempt} failed (running tasks), retrying in ${REBUILD_RETRY_DELAY_MS / 1000}s...`
        );
        await sleep(REBUILD_RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
  // Should never reach here due to the throw in the loop
  throw new Error('Failed to initiate rebuild after all retries');
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
    } catch (err) {
      // Individual image metadata can fail if OVH removes or hides the image
      // between the list call and the detail call. We skip it and try the rest.
      addLog(`[warn] Failed to fetch image details for ${imgId} on ${serviceName}: ${err}`);
    }
  }

  addLog(`Image "${REBUILD_IMAGE_NAME}" not found, using first available`);
  if (imageIds.length === 0) throw new Error('No rebuild images available');
  return imageIds[0];
}

/**
 * Wait for VPS rebuild to complete (state: installing → running).
 * Monitors the specific rebuild task for errors and fails fast if detected.
 */
export async function waitForRebuild(
  serviceName: string,
  addLog: (msg: string) => void,
  rebuildTaskId?: number
): Promise<void> {
  const deadline = Date.now() + REBUILD_POLL_TIMEOUT_MS;
  let wasInstalling = false;
  let lastTaskLog = 0; // throttle task detail logging to every ~60s
  let maintenanceCount = 0; // track consecutive maintenance polls

  while (Date.now() < deadline) {
    await sleep(REBUILD_POLL_INTERVAL_MS);
    try {
      const details = await ovhService.getVpsDetails(serviceName);
      const elapsed = Math.round((Date.now() + REBUILD_POLL_TIMEOUT_MS - deadline) / 1000);
      addLog(`[${elapsed}s] VPS state: ${details.state}`);
      if (details.state === 'installing') {
        wasInstalling = true;
        maintenanceCount = 0;
      }
      if (details.state === 'running' && wasInstalling) return;

      // Detect maintenance state — indicates a failed rebuild
      if (details.state === 'maintenance') {
        maintenanceCount++;
      }

      // Check rebuild task state for early error detection
      if (rebuildTaskId) {
        try {
          const task = await ovhService.getVpsTaskDetails(serviceName, rebuildTaskId);
          if (task.state === 'error') {
            addLog(`[${elapsed}s] Rebuild task ${rebuildTaskId} failed (state=error)`);
            throw new RebuildTaskError(`OVH rebuild task ${rebuildTaskId} failed with state=error`);
          }
        } catch (e) {
          if (e instanceof RebuildTaskError) throw e;
          // Task API may be unavailable during rebuild
        }
      }

      // If in maintenance for 2+ consecutive polls and no active rebuild, fail fast
      if (maintenanceCount >= 2 && wasInstalling) {
        // Double-check: look for any active reinstall tasks
        try {
          const taskIds = await ovhService.getVpsTasks(serviceName);
          let hasActiveReinstall = false;
          for (const taskId of taskIds) {
            const task = await ovhService.getVpsTaskDetails(serviceName, taskId);
            addLog(`[${elapsed}s] OVH task ${taskId}: type=${task.type}, state=${task.state}`);
            if (task.type === 'reinstallVm' && ACTIVE_TASK_STATES.has(task.state)) {
              hasActiveReinstall = true;
            }
          }
          if (!hasActiveReinstall) {
            addLog(`[${elapsed}s] VPS stuck in maintenance with no active reinstall tasks`);
            throw new RebuildTaskError(
              'VPS entered maintenance state with no active rebuild tasks — rebuild likely failed on OVH side'
            );
          }
        } catch (e) {
          if (e instanceof RebuildTaskError) throw e;
        }
      }

      // Log OVH task details periodically for diagnostics
      const now = Date.now();
      if (now - lastTaskLog >= 60_000) {
        lastTaskLog = now;
        try {
          const taskIds = await ovhService.getVpsTasks(serviceName);
          if (taskIds.length > 0) {
            for (const taskId of taskIds) {
              const task = await ovhService.getVpsTaskDetails(serviceName, taskId);
              addLog(`[${elapsed}s] OVH task ${taskId}: type=${task.type}, state=${task.state}`);
            }
          } else {
            addLog(`[${elapsed}s] No active OVH tasks`);
          }
        } catch {
          // Non-critical — task API may be unavailable during rebuild
        }
      }
    } catch (e: any) {
      if (e instanceof RebuildTaskError) throw e;
      addLog(`Rebuild poll error: ${e.message}`);
    }
  }

  // Log final task state on timeout for diagnostics
  try {
    const taskIds = await ovhService.getVpsTasks(serviceName);
    for (const taskId of taskIds) {
      const task = await ovhService.getVpsTaskDetails(serviceName, taskId);
      addLog(`Timeout — OVH task ${taskId}: type=${task.type}, state=${task.state}`);
    }
  } catch {
    // Best effort
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
// Telegram Channel Setup
// ============================================================

/**
 * Check which channels are configured on a deployment via SSH.
 */
export async function getChannelStatus(
  deploymentId: string,
  userId: string
): Promise<{ telegram: { configured: boolean } }> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId, status: { in: ['READY', 'CANCELING'] } },
  });

  if (!deployment) {
    throw new Error('Deployment not found or not in READY state');
  }

  return { telegram: { configured: deployment.telegramConfigured } };
}

/**
 * Configure a Telegram bot token on a deployment and restart the gateway.
 */
export async function configureTelegramBot(
  deploymentId: string,
  userId: string,
  botToken: string
): Promise<void> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId, status: { in: ['READY', 'CANCELING'] } },
  });

  if (!deployment) {
    throw new Error('Deployment not found or not in READY state');
  }

  if (!deployment.ipAddress || !deployment.sshPrivateKey) {
    throw new Error('Deployment missing IP or SSH key');
  }

  if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
    throw new Error('Invalid Telegram bot token format');
  }

  const telegramConfig = JSON.stringify({
    enabled: true,
    botToken,
    dmPolicy: 'pairing',
  });

  await sshExec(
    deployment.ipAddress,
    SSH_USERNAME,
    deployment.sshPrivateKey,
    `sudo openclaw config set channels.telegram --json '${telegramConfig}' && sudo openclaw config set plugins.entries.telegram.enabled true && sudo systemctl restart openclaw-gateway`,
    30_000
  );
}

/**
 * Approve a Telegram pairing code on a deployment via SSH.
 */
export async function approveTelegramPairing(
  deploymentId: string,
  userId: string,
  code: string
): Promise<{ success: boolean; message: string }> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId, status: { in: ['READY', 'CANCELING'] } },
  });

  if (!deployment) {
    throw new Error('Deployment not found or not in READY state');
  }

  if (!deployment.ipAddress || !deployment.sshPrivateKey) {
    throw new Error('Deployment missing IP or SSH key');
  }

  if (!/^[A-Za-z0-9-]+$/.test(code)) {
    throw new Error('Invalid pairing code format');
  }

  const result = await sshExec(
    deployment.ipAddress,
    SSH_USERNAME,
    deployment.sshPrivateKey,
    `sudo openclaw pairing approve telegram ${code} && sudo systemctl restart openclaw-gateway`,
    30_000
  );

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Failed to approve pairing code');
  }

  await prisma.openClawDeployment.update({
    where: { id: deploymentId },
    data: { telegramConfigured: true },
  });

  return { success: true, message: result.stdout.trim() || 'Pairing approved' };
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
 * Fulfill a credit purchase after Stripe Checkout completes (called from webhook).
 * Payment has already been collected — just update the balance and records.
 */
export async function fulfillCreditPurchase(
  deploymentId: string,
  amountUsd: number,
  stripePaymentIntentId: string
): Promise<void> {
  const deployment = await prisma.openClawDeployment.findUnique({
    where: { id: deploymentId },
  });

  if (!deployment) {
    console.error(`[openclaw] fulfillCreditPurchase: deployment ${deploymentId} not found`);
    return;
  }

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
        stripePaymentIntentId,
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

  console.log(
    `[openclaw] Credited $${amountUsd} to deployment ${deploymentId}, new balance: $${newBalance}`
  );
}

// ============================================================
// Reprovision (reinstall OpenClaw on existing VPS)
// ============================================================

/**
 * Reprovision OpenClaw on an existing VPS. Reinstalls without ordering a new VPS.
 * Validates that the VPS exists (has service name, SSH keys, IP), creates a new
 * OpenRouter key, and runs the setup script.
 */
export async function reprovision(
  deploymentId: string,
  userId: string
): Promise<OpenClawDeployment> {
  const deployment = await prisma.openClawDeployment.findFirst({
    where: { id: deploymentId, userId },
  });

  if (!deployment) throw new Error('Deployment not found');
  if (!['READY', 'CANCELING', 'ERROR'].includes(deployment.status)) {
    throw new Error('Can only reprovision READY, CANCELING, or ERROR deployments');
  }
  if (
    !deployment.ovhServiceName ||
    !deployment.sshPublicKey ||
    !deployment.sshPrivateKey ||
    !deployment.ipAddress
  ) {
    throw new Error('Deployment missing VPS details — cannot reprovision without an existing VPS');
  }

  console.log(`[openclaw] Reprovisioning deployment ${deploymentId}...`);

  // Clean up old OpenRouter key
  if (deployment.openRouterKeyHash) {
    try {
      await openRouterService.deleteKey(deployment.openRouterKeyHash);
      console.log(`[openclaw] Cleaned up old OpenRouter key ${deployment.openRouterKeyHash}`);
    } catch (err: any) {
      console.error(`[openclaw] Failed to clean up OpenRouter key:`, err.message);
    }
  }

  // Create new OpenRouter key
  const shortId = deploymentId.slice(-8);
  const orKey = await openRouterService.createKey(`openclaw-${shortId}`, {
    limit: Number(deployment.creditBalanceUsd) || 25,
  });

  const updated = await prisma.openClawDeployment.update({
    where: { id: deploymentId },
    data: {
      status: 'INSTALLING',
      statusMessage: 'Reprovisioning — reinstalling OpenClaw on existing VPS',
      openRouterKeyHash: orKey.hash,
      accessToken: null,
      provisionLog: null,
      provisionStage: 'vps_rebuilt',
    },
  });

  // Start async reprovisioning (don't await)
  reprovisionAsync(deploymentId, orKey.key).catch(async (err) => {
    console.error(`[openclaw] Reprovision failed for ${deploymentId}:`, err);
    await updateDeployment(deploymentId, {
      status: 'ERROR',
      statusMessage: `Reprovision failed: ${err.message}`,
    }).catch(console.error);
  });

  return updated;
}

/**
 * Async reprovisioning job — SSH into existing VPS and reinstall OpenClaw.
 */
async function reprovisionAsync(deploymentId: string, orKeyRaw: string): Promise<void> {
  const deployment = await prisma.openClawDeployment.findUnique({ where: { id: deploymentId } });
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  const ip = deployment.ipAddress!;
  const privateKey = deployment.sshPrivateKey!;
  const hostname = deployment.hostname || deployment.ovhServiceName!;

  let log = deployment.provisionLog || '';
  const addLog = (msg: string) => {
    console.log(`[openclaw:${deploymentId}] ${msg}`);
    log = appendLog(log, msg);
  };

  try {
    // 1. Wait for SSH
    addLog('Waiting for SSH access...');
    const sshUser = await waitForSsh(ip, privateKey);
    addLog(`SSH connected as ${sshUser}`);

    // 2. Clean up old marker files so the new setup script starts fresh
    addLog('Cleaning up old setup markers...');
    await sshExec(
      ip,
      sshUser,
      privateKey,
      'sudo rm -f /root/.openclaw-setup-started /root/.openclaw-setup-complete /root/.openclaw-setup-token /root/.openclaw-setup-error',
      15_000
    );

    // 3. Generate Vincent API keys for existing secrets
    let vincentApiKeys:
      | { dataSourcesKey: string; walletKey: string; polymarketKey: string }
      | undefined;
    const secretIds = (deployment.vincentSecretIds as Record<string, string>) || {};
    if (secretIds.dataSourcesSecretId && secretIds.walletSecretId && secretIds.polymarketSecretId) {
      addLog('Generating Vincent API keys for reprovision...');
      const keys: Record<string, string> = {};
      for (const [idKey, ctxKey] of [
        ['dataSourcesSecretId', 'dataSourcesKey'],
        ['walletSecretId', 'walletKey'],
        ['polymarketSecretId', 'polymarketKey'],
      ] as const) {
        const { plainKey } = await apiKeyService.createApiKey({
          secretId: secretIds[idKey],
          name: 'OpenClaw Pre-provisioned (reprovision)',
        });
        keys[ctxKey] = plainKey;
      }
      vincentApiKeys = {
        dataSourcesKey: keys.dataSourcesKey,
        walletKey: keys.walletKey,
        polymarketKey: keys.polymarketKey,
      };
    }

    // 4. Launch setup script
    addLog('Launching OpenClaw setup script (detached)...');
    const setupScript = buildSetupScript(orKeyRaw, hostname, vincentApiKeys);
    await launchSetupScript(ip, sshUser, privateKey, setupScript, addLog);

    await updateDeployment(deploymentId, {
      provisionLog: log,
      provisionStage: 'setup_script_launched',
    });

    // 4. Poll for completion
    addLog('Polling for setup completion...');
    const token = await pollSetupCompletion(ip, sshUser, privateKey, addLog);

    await updateDeployment(deploymentId, {
      accessToken: token || undefined,
      provisionLog: log,
      provisionStage: 'setup_complete',
    });

    // 5. Health check
    addLog('Waiting for OpenClaw health check...');
    const healthy = await waitForHealth(ip, hostname);
    if (healthy) {
      addLog('OpenClaw is healthy and responding!');
    } else {
      addLog('Health check timed out — OpenClaw may still be starting');
    }

    await updateDeployment(deploymentId, {
      status: 'READY',
      statusMessage: healthy
        ? 'OpenClaw is live and accessible'
        : 'OpenClaw deployed (health check pending)',
      readyAt: new Date(),
      provisionLog: log,
    });

    // Apply any pending referral rewards for this user
    try {
      const { applyPendingRewards } = await import('./referral.service.js');
      const applied = await applyPendingRewards(deployment.userId);
      if (applied > 0) {
        addLog(`Applied ${applied} pending referral reward(s)`);
      }
    } catch (refErr: any) {
      addLog(`Failed to apply referral rewards: ${refErr.message}`);
    }

    addLog('Reprovision complete!');
  } catch (err: any) {
    addLog(`ERROR: ${err.message}`);
    await updateDeployment(deploymentId, {
      status: 'ERROR',
      statusMessage: `Reprovision failed: ${err.message}`,
      provisionLog: log,
    });
    throw err;
  }
}

// ============================================================
// Retry Failed Deployment
// ============================================================

/**
 * Retry a failed deployment. Cleans up partial resources (OpenRouter key),
 * then re-provisions from scratch using the existing subscription.
 */
export async function retryDeploy(
  deploymentId: string,
  userId: string
): Promise<OpenClawDeployment> {
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

  // Smart retry: if VPS already exists, reuse it (skip ordering/delivery)
  const hasVps = deployment.ovhServiceName && deployment.sshPublicKey && deployment.sshPrivateKey;

  const updated = hasVps
    ? await prisma.openClawDeployment.update({
        where: { id: deploymentId },
        data: {
          status: 'PROVISIONING',
          statusMessage: 'Retrying — reusing existing VPS',
          openRouterKeyHash: null,
          accessToken: null,
          readyAt: null,
          provisionLog: null,
          provisionStage: 'vps_ip_acquired',
        },
      })
    : await prisma.openClawDeployment.update({
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
          provisionStage: null,
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
      console.error(
        `[openclaw:cleanup] Failed to clean up abandoned checkout ${d.id}:`,
        err.message
      );
    }
  }

  if (keysRevoked > 0 || abandonedCheckouts > 0) {
    console.log(
      `[openclaw:cleanup] Cleaned up: ${keysRevoked} orphaned keys, ${abandonedCheckouts} abandoned checkouts`
    );
  }

  return { keysRevoked, abandonedCheckouts };
}

// ============================================================
// Stale Deployment Timeout
// ============================================================

const PROVISIONING_TIMEOUT_MS = 20 * 60_000; // 20 min for PENDING/ORDERING
const INSTALLING_TIMEOUT_MS = 45 * 60_000; // 45 min for PROVISIONING/INSTALLING (setup script runs detached, Railway restarts add delay)
const CHECKOUT_TIMEOUT_MS = 60 * 60_000; // 1 hour for PENDING_PAYMENT

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
    ...staleCheckouts.map((d: { id: string }) => ({
      id: d.id,
      reason: 'Checkout session timed out',
    })),
    ...staleOrdering.map((d: { id: string }) => ({
      id: d.id,
      reason: 'VPS provisioning timed out after 20 minutes',
    })),
    ...staleInstalling.map((d: { id: string }) => ({
      id: d.id,
      reason: 'Installation timed out after 45 minutes',
    })),
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
          await prisma.openClawDeployment
            .update({
              where: { id: d.id },
              data: { statusMessage: 'OpenClaw is live and accessible' },
            })
            .catch(console.error);
        }
      }
    } else {
      unhealthy++;
      const newFailures = prevFailures + 1;
      healthFailureCounts.set(d.id, newFailures);

      if (newFailures >= HEALTH_FAILURE_THRESHOLD) {
        await prisma.openClawDeployment
          .update({
            where: { id: d.id },
            data: {
              statusMessage: `Instance not responding (${newFailures} consecutive failures)`,
            },
          })
          .catch(console.error);
        console.log(`[openclaw:health] Deployment ${d.id} unhealthy (${newFailures} failures)`);
      }
    }
  }

  // Clean up tracking for deployments that no longer exist
  for (const id of healthFailureCounts.keys()) {
    if (!deployments.find((d) => d.id === id)) {
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
// Startup Resume
// ============================================================

const RESUME_STARTUP_DELAY_MS = 45_000; // Wait 45s for old Railway instance to fully drain

/**
 * Resume deployments that were interrupted by a Railway restart.
 * Called once at startup after the server begins listening.
 * Waits 45s to ensure the old instance has fully shut down (Railway
 * sends SIGTERM + 30s drain), then picks up any in-flight deployments.
 */
export async function resumeInterruptedDeployments(): Promise<void> {
  console.log(
    `[openclaw:resume] Waiting ${RESUME_STARTUP_DELAY_MS / 1000}s before checking for interrupted deployments...`
  );
  await sleep(RESUME_STARTUP_DELAY_MS);

  try {
    const interrupted = await prisma.openClawDeployment.findMany({
      where: {
        status: { in: ['PENDING', 'ORDERING', 'PROVISIONING', 'INSTALLING'] },
      },
      select: { id: true, status: true, provisionStage: true },
    });

    if (interrupted.length === 0) {
      console.log('[openclaw:resume] No interrupted deployments found');
      return;
    }

    console.log(`[openclaw:resume] Found ${interrupted.length} interrupted deployment(s)`);

    for (const d of interrupted) {
      console.log(
        `[openclaw:resume] Resuming deployment ${d.id} (status: ${d.status}, stage: ${d.provisionStage || 'none'})`
      );
      provisionAsync(d.id, {}).catch(async (err) => {
        console.error(`[openclaw:resume] Failed to resume ${d.id}:`, err);
        await updateDeployment(d.id, {
          status: 'ERROR',
          statusMessage: `Resume failed: ${err.message}`,
        }).catch(console.error);
      });
    }
  } catch (err) {
    console.error('[openclaw:resume] Error checking for interrupted deployments:', err);
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
    sshPrivateKey: _sshPrivateKey,
    sshPublicKey: _sshPublicKey,
    openRouterKeyHash: _openRouterKeyHash,
    ovhOrderId: _ovhOrderId,
    ovhCartId: _ovhCartId,
    provisionLog: _provisionLog,
    provisionStage: _provisionStage,
    ...publicFields
  } = deployment;
  return publicFields;
}
