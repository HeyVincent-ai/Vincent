import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

const DEFAULT_CADDYFILE = '/etc/caddy/Caddyfile';
const CADDY_CONF_DIR = '/etc/caddy/conf.d';
const TM_CONF_FILE = 'trade-manager.caddy';
const TM_MARKER = '# managed by trade-manager';

export interface HttpsSetupResult {
  success: boolean;
  dashboardUrl?: string;
  hostname?: string;
}

function isCaddyInstalled(): boolean {
  try {
    execSync('which caddy', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the site address (hostname) from the first site block in a Caddyfile.
 * Skips global options blocks (`{ ... }` with no address) and bare-port listeners (`:1234`).
 */
export function parseCaddyfileHostname(caddyfilePath = DEFAULT_CADDYFILE): string | null {
  try {
    if (!fs.existsSync(caddyfilePath)) return null;
    const content = fs.readFileSync(caddyfilePath, 'utf8');

    let insideBlock = 0;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('import ')) continue;

      // Track brace depth so we skip over global-options and nested blocks
      if (trimmed === '{') {
        insideBlock++;
        continue;
      }
      if (trimmed === '}' || trimmed.endsWith('}')) {
        if (insideBlock > 0) insideBlock--;
        continue;
      }
      if (insideBlock > 0) continue;

      // Site address line: "hostname {" or "hostname:port {"
      const match = trimmed.match(/^([a-zA-Z0-9._-]+(?::\d+)?)\s*\{?\s*$/);
      if (!match) continue;

      const address = match[1];
      // Skip bare-port addresses like :443
      if (address.startsWith(':')) continue;
      return address;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Run a shell command, trying without sudo first, then with sudo.
 * Returns true if the command succeeded via either path.
 */
function runPrivileged(cmd: string, timeoutMs = 15_000): boolean {
  try {
    execSync(cmd, { stdio: 'pipe', timeout: timeoutMs });
    return true;
  } catch {
    try {
      execSync(`sudo -n ${cmd}`, { stdio: 'pipe', timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }
}

function writeTmCaddyConfig(hostname: string, backendPort: number, httpsPort: number): boolean {
  const config = [
    TM_MARKER,
    `${hostname}:${httpsPort} {`,
    `    reverse_proxy localhost:${backendPort} {`,
    `        header_down -Content-Security-Policy`,
    `        header_down -X-Frame-Options`,
    `    }`,
    `    header Content-Security-Policy "frame-ancestors 'self' https://*.heyvincent.ai https://heyvincent.ai"`,
    `}`,
    '',
  ].join('\n');

  const tmpFile = path.join('/tmp', TM_CONF_FILE);
  try {
    fs.writeFileSync(tmpFile, config);
  } catch (err) {
    logger.warn({ err }, 'Failed to write temp Caddy config');
    return false;
  }

  if (!runPrivileged(`mkdir -p ${CADDY_CONF_DIR}`)) {
    logger.warn('Cannot create %s', CADDY_CONF_DIR);
    return false;
  }

  const destPath = path.join(CADDY_CONF_DIR, TM_CONF_FILE);
  if (!runPrivileged(`cp ${tmpFile} ${destPath}`)) {
    logger.warn('Cannot copy Caddy config to %s', destPath);
    return false;
  }

  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* best effort */
  }
  return true;
}

function ensureImportDirective(caddyfilePath: string): boolean {
  try {
    const content = fs.readFileSync(caddyfilePath, 'utf8');
    const importLine = `import ${CADDY_CONF_DIR}/*`;
    if (content.includes(importLine)) return true;

    const newContent = `${importLine}\n\n${content}`;
    const tmpFile = '/tmp/Caddyfile.tm-patch';
    fs.writeFileSync(tmpFile, newContent);

    if (!runPrivileged(`cp ${tmpFile} ${caddyfilePath}`)) {
      logger.warn('Cannot add import directive to Caddyfile');
      return false;
    }

    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* best effort */
    }
    return true;
  } catch {
    return false;
  }
}

function reloadCaddy(): boolean {
  if (runPrivileged('systemctl reload caddy')) return true;
  if (runPrivileged(`caddy reload --config ${DEFAULT_CADDYFILE}`)) return true;
  return false;
}

function tryOpenFirewallPort(port: number): void {
  if (runPrivileged(`ufw allow ${port}/tcp`)) {
    logger.info({ port }, 'Opened firewall port');
  }
}

async function verifyHttps(url: string, retries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return false;
}

/**
 * Attempt to configure Caddy as an HTTPS reverse proxy in front of the
 * trade-manager HTTP server.
 *
 * Steps:
 * 1. Check Caddy is installed.
 * 2. Parse the hostname from an existing Caddyfile.
 * 3. Write a conf.d snippet with `hostname:httpsPort` → `localhost:backendPort`.
 * 4. Ensure the main Caddyfile imports conf.d/*.
 * 5. Open the firewall port (best-effort).
 * 6. Reload Caddy.
 * 7. Verify the HTTPS endpoint is reachable.
 *
 * On failure at any step the config is rolled back and `{ success: false }` is
 * returned so the caller can fall back to plain HTTP.
 */
export async function trySetupHttps(
  backendPort: number,
  httpsPort: number,
  caddyfilePath = DEFAULT_CADDYFILE
): Promise<HttpsSetupResult> {
  logger.info('Attempting HTTPS setup via Caddy…');

  if (!isCaddyInstalled()) {
    logger.info('Caddy not installed — skipping HTTPS setup');
    return { success: false };
  }

  const hostname = parseCaddyfileHostname(caddyfilePath);
  if (!hostname) {
    logger.info('No hostname found in Caddyfile — skipping HTTPS setup');
    return { success: false };
  }
  logger.info({ hostname, httpsPort }, 'Found Caddy hostname');

  // Check if our config already exists and is current
  const confPath = path.join(CADDY_CONF_DIR, TM_CONF_FILE);
  const alreadyConfigured = (() => {
    try {
      const existing = fs.readFileSync(confPath, 'utf8');
      return (
        existing.includes(TM_MARKER) &&
        existing.includes(`${hostname}:${httpsPort}`) &&
        existing.includes(`localhost:${backendPort}`)
      );
    } catch {
      return false;
    }
  })();

  if (!alreadyConfigured) {
    if (!writeTmCaddyConfig(hostname, backendPort, httpsPort)) {
      return { success: false, hostname };
    }
    if (!ensureImportDirective(caddyfilePath)) {
      cleanupCaddyConfig();
      return { success: false, hostname };
    }
    tryOpenFirewallPort(httpsPort);
    if (!reloadCaddy()) {
      logger.warn('Failed to reload Caddy');
      cleanupCaddyConfig();
      return { success: false, hostname };
    }
    // Give Caddy time to provision TLS and bind the port
    await new Promise((r) => setTimeout(r, 4000));
  }

  const dashboardUrl = `https://${hostname}:${httpsPort}`;
  const ok = await verifyHttps(`${dashboardUrl}/health`);
  if (!ok) {
    logger.warn(
      { dashboardUrl },
      'HTTPS verification failed — port may be firewalled or cert not ready'
    );
    if (!alreadyConfigured) cleanupCaddyConfig();
    return { success: false, hostname };
  }

  logger.info({ dashboardUrl }, 'HTTPS dashboard is live');
  return { success: true, dashboardUrl, hostname };
}

export function cleanupCaddyConfig(): void {
  const confPath = path.join(CADDY_CONF_DIR, TM_CONF_FILE);
  try {
    if (fs.existsSync(confPath)) {
      runPrivileged(`rm ${confPath}`);
      reloadCaddy();
      logger.info('Cleaned up Caddy trade-manager config');
    }
  } catch {
    /* best effort */
  }
}
