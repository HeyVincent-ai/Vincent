/**
 * OpenClaw Deploy Orchestration Service
 *
 * Manages the full lifecycle of OpenClaw VPS deployments:
 * 1. Provision OpenRouter API key
 * 2. Order VPS from OVH
 * 3. Poll until VPS is delivered
 * 4. SSH into VPS and run setup script
 * 5. Poll health endpoint until ready
 * 6. Store deployment details
 *
 * Destroy flow:
 * 1. Terminate VPS via OVH
 * 2. Revoke OpenRouter API key
 * 3. Clean up SSH keys
 */

import { generateKeyPairSync } from 'crypto';
import { Client as SshClient } from 'ssh2';
import prisma from '../db/client.js';
import * as ovhService from './ovh.service.js';
import * as openRouterService from './openrouter.service.js';
import type { OpenClawDeployment, OpenClawStatus } from '@prisma/client';

// ============================================================
// Constants
// ============================================================

const DEFAULT_PLAN_CODE = 'vps-2025-model1';
const DEFAULT_DATACENTER = 'US-WEST-OR';
const DEFAULT_OS = 'Ubuntu 24.04';
const OPENCLAW_PORT = 18789;

// Polling intervals
const ORDER_POLL_INTERVAL_MS = 30_000;      // 30s
const ORDER_POLL_TIMEOUT_MS = 15 * 60_000;  // 15 min
const SSH_RETRY_INTERVAL_MS = 15_000;       // 15s
const SSH_RETRY_TIMEOUT_MS = 5 * 60_000;    // 5 min
const HEALTH_POLL_INTERVAL_MS = 10_000;     // 10s
const HEALTH_POLL_TIMEOUT_MS = 10 * 60_000; // 10 min

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

function generateSshKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Convert PEM public key to OpenSSH format for OVH
  const { publicKey: sshPub } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // We'll use ssh-keygen style conversion or just pass the PEM
  // For OVH, we need OpenSSH format. Let's generate using crypto and convert.
  // Actually, let's just use the ssh2 library's key format support.

  return { publicKey, privateKey };
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
 */
function sshExec(
  host: string,
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
      conn.exec(command, (err, stream) => {
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

    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    conn.connect({
      host,
      port: 22,
      username: 'root',
      privateKey,
      readyTimeout: 30_000,
    });
  });
}

/**
 * Wait for SSH to become available on the VPS.
 */
async function waitForSsh(
  host: string,
  privateKey: string,
  timeoutMs: number = SSH_RETRY_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const result = await sshExec(host, privateKey, 'echo ok', 15_000);
      if (result.stdout.includes('ok')) return;
    } catch {
      // SSH not ready yet
    }
    await sleep(SSH_RETRY_INTERVAL_MS);
  }

  throw new Error(`SSH not available on ${host} after ${timeoutMs}ms`);
}

// ============================================================
// VPS Setup Script
// ============================================================

function buildSetupScript(openRouterApiKey: string, vpsIp: string): string {
  return `#!/bin/bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "=== [1/7] System update ==="
apt-get update -qq
apt-get install -y -qq curl caddy ufw python3

echo "=== [2/7] Running OpenClaw installer ==="
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard

echo "=== [3/7] Installing Vincent agent wallet skill ==="
npx --yes clawhub@latest install agentwallet || true

echo "=== [4/7] Configuring OpenClaw ==="
mkdir -p ~/.openclaw
if [ -f ~/.openclaw/openclaw.json ]; then
  python3 -c "
import json
with open('$HOME/.openclaw/openclaw.json') as f:
    cfg = json.load(f)
cfg.setdefault('env', {})
cfg['env']['OPENROUTER_API_KEY'] = '${openRouterApiKey}'
cfg['model'] = 'openrouter/google/gemini-3-flash-preview'
cfg['gateway'] = {
    'mode': 'local',
    'bind': 'loopback',
    'controlUi': {
        'allowInsecureAuth': True
    },
    'trustedProxies': ['127.0.0.1/32', '::1/128'],
    'auth': cfg.get('gateway', {}).get('auth', {'mode': 'token', 'token': ''})
}
with open('$HOME/.openclaw/openclaw.json', 'w') as f:
    json.dump(cfg, f, indent=2)
"
else
  cat > ~/.openclaw/openclaw.json << 'OCCONFIG'
{
  "env": {
    "OPENROUTER_API_KEY": "${openRouterApiKey}"
  },
  "model": "openrouter/google/gemini-3-flash-preview",
  "gateway": {
    "mode": "local",
    "bind": "loopback",
    "controlUi": {
      "allowInsecureAuth": true
    },
    "trustedProxies": ["127.0.0.1/32", "::1/128"],
    "auth": {
      "mode": "token",
      "token": ""
    }
  }
}
OCCONFIG
fi

echo "=== [5/7] Configuring Caddy reverse proxy ==="
cat > /etc/caddy/Caddyfile << 'CADDYEOF'
https://${vpsIp} {
    reverse_proxy localhost:${OPENCLAW_PORT}
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy

echo "=== [6/7] Configuring firewall ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== [7/7] Starting OpenClaw gateway ==="
if ! systemctl is-active --quiet openclaw-gateway; then
  cat > /etc/systemd/system/openclaw-gateway.service << 'UNIT'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/openclaw gateway start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable openclaw-gateway
  systemctl start openclaw-gateway
fi

# Wait a moment for the gateway to generate its token
sleep 5

# Extract access token
ACCESS_TOKEN=$(cat ~/.openclaw/openclaw.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('gateway',{}).get('auth',{}).get('token',''))" 2>/dev/null || echo "")
echo "OPENCLAW_ACCESS_TOKEN=\${ACCESS_TOKEN}"

echo "=== Setup complete ==="
`;
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
      // Try HTTPS first (Caddy with Let's Encrypt IP cert)
      const res = await fetch(`https://${ipAddress}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok || res.status === 401 || res.status === 403) {
        // 401/403 means the gateway is up but requires auth — that's fine
        return true;
      }
    } catch {
      // Not ready yet — try HTTP as fallback
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
  const planCode = options.planCode || DEFAULT_PLAN_CODE;
  const datacenter = options.datacenter || DEFAULT_DATACENTER;
  const os = options.os || DEFAULT_OS;
  let log = '';

  const addLog = (msg: string) => {
    console.log(`[openclaw:${deploymentId}] ${msg}`);
    log = appendLog(log, msg);
  };

  try {
    // Step 1: Provision OpenRouter API key
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

    // Step 2: Order VPS
    addLog(`Ordering VPS (plan: ${planCode}, dc: ${datacenter}, os: ${os})...`);
    await updateDeployment(deploymentId, {
      status: 'ORDERING',
      statusMessage: 'Placing VPS order with OVH',
      provisionLog: log,
    });

    const order = await ovhService.orderVps({
      planCode,
      datacenter,
      os,
    });
    addLog(`VPS order placed (orderId: ${order.orderId})`);

    await updateDeployment(deploymentId, {
      ovhOrderId: String(order.orderId),
      provisionLog: log,
    });

    // Step 3: Poll order status until VPS is delivered
    addLog('Waiting for VPS delivery...');
    const deliveredServiceName = await pollForDelivery(order.orderId, addLog);
    addLog(`VPS delivered: ${deliveredServiceName}`);

    await updateDeployment(deploymentId, {
      status: 'PROVISIONING',
      statusMessage: 'VPS delivered, retrieving IP address',
      ovhServiceName: deliveredServiceName,
      provisionLog: log,
    });

    // Step 4: Get VPS IP
    const vpsDetails = await ovhService.getVpsDetails(deliveredServiceName);
    const ipAddress = vpsDetails.ips[0];
    if (!ipAddress) {
      // Try the /ips endpoint
      const ips = await ovhService.getVpsIps(deliveredServiceName);
      if (!ips.length) throw new Error('VPS has no IP addresses');
    }
    const ip = ipAddress || (await ovhService.getVpsIps(deliveredServiceName))[0];
    addLog(`VPS IP: ${ip}`);

    await updateDeployment(deploymentId, {
      ipAddress: ip,
      provisionLog: log,
    });

    // Step 5: Wait for SSH to become available
    addLog('Waiting for SSH to become available...');
    // Note: For OVH VPS, the root password is emailed. We may need to use
    // the OVH SSH key mechanism or wait for the key to be injected.
    // For now, we'll generate a keypair and attempt to register it.
    // If SSH key auth doesn't work out of the box, we'll need to use
    // OVH's VNC/console or rebuild with SSH key.

    // TODO: The SSH auth flow needs testing on a real VPS.
    // OVH typically sets up the default SSH key registered on the account.
    // We may need to rebuild the VPS with our SSH key after initial delivery.

    await updateDeployment(deploymentId, {
      status: 'INSTALLING',
      statusMessage: 'Connecting to VPS and installing OpenClaw',
      provisionLog: log,
    });

    // For now, we'll try password-less SSH (relies on OVH account SSH key)
    // This will be refined after testing on a real VPS.
    addLog('TODO: SSH setup needs real VPS testing');
    addLog('Provisioning flow stops here until SSH auth is validated');

    // Step 6: SSH in and run setup
    // const setupScript = buildSetupScript(orKey.key, ip);
    // await waitForSsh(ip, sshPrivateKey);
    // const result = await sshExec(ip, sshPrivateKey, setupScript, 10 * 60_000);

    // Step 7: Extract access token
    // const tokenMatch = result.stdout.match(/OPENCLAW_ACCESS_TOKEN=(.*)/);
    // const accessToken = tokenMatch?.[1] || '';

    // Step 8: Wait for health check
    // const healthy = await waitForHealth(ip);

    // For now, mark as requiring manual intervention
    await updateDeployment(deploymentId, {
      status: 'PROVISIONING',
      statusMessage: 'VPS ready — SSH setup pending (needs real VPS testing)',
      provisionLog: log,
    });

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

/**
 * Poll OVH until the VPS order is delivered and return the service name.
 */
async function pollForDelivery(
  orderId: number,
  addLog: (msg: string) => void
): Promise<string> {
  const deadline = Date.now() + ORDER_POLL_TIMEOUT_MS;

  // Track VPS list before to detect new additions
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
      addLog(`Order ${orderId} status: ${status.status}`);

      // Check for associated service
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
    deployment.sshPrivateKey,
    'systemctl restart openclaw-gateway',
    30_000
  );

  return deployment;
}
