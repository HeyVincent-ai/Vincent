import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Compiled layout: dist/systemd/setup.js → package root is two levels up
const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const CLI_PATH = path.join(PACKAGE_ROOT, 'dist', 'cli.js');
const SERVICE_NAME = 'openclaw-trade-manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function run(cmd: string, opts?: { sudo?: boolean }): boolean {
  const prefix = opts?.sudo ? 'sudo -n ' : '';
  try {
    execSync(`${prefix}${cmd}`, { stdio: 'pipe', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

function runOutput(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: 'pipe', timeout: 10_000 }).toString().trim();
  } catch {
    return null;
  }
}

/**
 * Try to enable lingering so user services survive logout.
 * Requires loginctl + (root or passwordless sudo).
 */
function tryEnableLinger(user: string): void {
  if (!hasCommand('loginctl')) return;
  if (!run(`loginctl enable-linger ${user}`)) {
    run(`loginctl enable-linger ${user}`, { sudo: true });
  }
}

// ---------------------------------------------------------------------------
// Service file generation
// ---------------------------------------------------------------------------

interface ServiceOptions {
  system: boolean;
  runAsUser: string;
  homeDir: string;
  cliPath: string;
}

function generateServiceUnit(opts: ServiceOptions): string {
  const lines = [
    '[Unit]',
    'Description=OpenClaw Trade Manager',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
  ];

  if (opts.system) {
    lines.push(`User=${opts.runAsUser}`);
    lines.push(`Group=${opts.runAsUser}`);
  }

  lines.push(
    `ExecStart=/usr/bin/env node ${opts.cliPath} start`,
    'Restart=always',
    'RestartSec=5',
    'Environment=NODE_ENV=production',
    `Environment=HOME=${opts.homeDir}`,
    `WorkingDirectory=${opts.homeDir}`,
    'StandardOutput=journal',
    'StandardError=journal',
    '',
    '[Install]',
    opts.system ? 'WantedBy=multi-user.target' : 'WantedBy=default.target',
    ''
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// System-level service (running as root / sudo)
// ---------------------------------------------------------------------------

function installSystemService(user: string, homeDir: string): boolean {
  const servicePath = `/etc/systemd/system/${SERVICE_NAME}.service`;
  const content = generateServiceUnit({
    system: true,
    runAsUser: user,
    homeDir,
    cliPath: CLI_PATH,
  });

  const tmpFile = `/tmp/${SERVICE_NAME}.service`;
  try {
    fs.writeFileSync(tmpFile, content);
  } catch {
    return false;
  }

  const useSudo = process.getuid?.() !== 0;
  const s = useSudo ? { sudo: true } : {};

  if (!run(`cp ${tmpFile} ${servicePath}`, s)) return false;
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* best effort */
  }

  run('systemctl daemon-reload', s);
  run(`systemctl enable ${SERVICE_NAME}`, s);
  run(`systemctl restart ${SERVICE_NAME}`, s);
  tryEnableLinger(user);
  return true;
}

function removeSystemService(): boolean {
  const useSudo = process.getuid?.() !== 0;
  const s = useSudo ? { sudo: true } : {};
  run(`systemctl stop ${SERVICE_NAME}`, s);
  run(`systemctl disable ${SERVICE_NAME}`, s);
  run(`rm /etc/systemd/system/${SERVICE_NAME}.service`, s);
  run('systemctl daemon-reload', s);
  return true;
}

// ---------------------------------------------------------------------------
// User-level service (no root needed)
// ---------------------------------------------------------------------------

function installUserService(homeDir: string): boolean {
  const serviceDir = path.join(homeDir, '.config', 'systemd', 'user');
  const servicePath = path.join(serviceDir, `${SERVICE_NAME}.service`);
  const content = generateServiceUnit({
    system: false,
    runAsUser: os.userInfo().username,
    homeDir,
    cliPath: CLI_PATH,
  });

  try {
    fs.mkdirSync(serviceDir, { recursive: true });
    fs.writeFileSync(servicePath, content);
  } catch {
    return false;
  }

  run('systemctl --user daemon-reload');
  run(`systemctl --user enable ${SERVICE_NAME}`);
  run(`systemctl --user restart ${SERVICE_NAME}`);
  tryEnableLinger(os.userInfo().username);
  return true;
}

function removeUserService(): boolean {
  const serviceDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  const servicePath = path.join(serviceDir, `${SERVICE_NAME}.service`);
  run(`systemctl --user stop ${SERVICE_NAME}`);
  run(`systemctl --user disable ${SERVICE_NAME}`);
  try {
    fs.unlinkSync(servicePath);
  } catch {
    /* ignore */
  }
  run('systemctl --user daemon-reload');
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SetupResult {
  installed: boolean;
  mode?: 'system' | 'user';
  reason?: string;
}

/**
 * Attempt to install and start a systemd service for trade-manager.
 *
 * Strategy:
 *  - If systemctl is not present → skip.
 *  - If running as root (e.g. `sudo npm i -g`), install a **system** service
 *    that runs as `$SUDO_USER` (or the owner of $HOME).
 *  - Otherwise install a **user** service in ~/.config/systemd/user/.
 *  - If `systemctl --user` doesn't work AND `sudo -n` is unavailable → skip.
 */
export function setupService(): SetupResult {
  if (process.platform !== 'linux') {
    return { installed: false, reason: 'Not Linux — skipping systemd setup' };
  }

  if (!hasCommand('systemctl')) {
    return { installed: false, reason: 'systemctl not found — skipping' };
  }

  if (!fs.existsSync(CLI_PATH)) {
    return { installed: false, reason: 'CLI not built yet — skipping' };
  }

  const isRoot = process.getuid?.() === 0;

  if (isRoot) {
    // Determine the real user (the one who ran sudo)
    const sudoUser = process.env.SUDO_USER;
    const homeDir = sudoUser
      ? ((runOutput(`getent passwd ${sudoUser}`) ?? '').split(':')[5] ?? `/home/${sudoUser}`)
      : os.homedir();
    const user = sudoUser ?? os.userInfo().username;

    if (installSystemService(user, homeDir)) {
      return { installed: true, mode: 'system' };
    }
    return { installed: false, reason: 'Failed to install system service' };
  }

  // Non-root path: try user service first
  const userDaemonWorks = (() => {
    try {
      execSync('systemctl --user status', { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch (err: unknown) {
      // exit 1 just means "no unit queried" which is fine
      return (err as { status?: number })?.status === 1;
    }
  })();

  if (userDaemonWorks) {
    if (installUserService(os.homedir())) {
      return { installed: true, mode: 'user' };
    }
  }

  // Try system service with sudo as a fallback
  const hasSudo = run('sudo -n true');
  if (hasSudo) {
    const user = os.userInfo().username;
    if (installSystemService(user, os.homedir())) {
      return { installed: true, mode: 'system' };
    }
  }

  return {
    installed: false,
    reason: 'No permission to install service (need sudo or user systemd)',
  };
}

export function removeService(): { removed: boolean; reason?: string } {
  if (process.platform !== 'linux' || !hasCommand('systemctl')) {
    return { removed: false, reason: 'systemd not available' };
  }

  // Check for system service first, then user service
  const systemPath = `/etc/systemd/system/${SERVICE_NAME}.service`;
  if (fs.existsSync(systemPath)) {
    removeSystemService();
    return { removed: true };
  }

  const userPath = path.join(os.homedir(), '.config', 'systemd', 'user', `${SERVICE_NAME}.service`);
  if (fs.existsSync(userPath)) {
    removeUserService();
    return { removed: true };
  }

  return { removed: false, reason: 'No service found to remove' };
}
