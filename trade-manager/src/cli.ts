#!/usr/bin/env node
import { PACKAGE_VERSION } from './utils/packageInfo.js';

const command = process.argv[2] ?? 'version';

if (command === 'version' || command === '--version' || command === '-v') {
  console.log(PACKAGE_VERSION);
} else if (command === 'config') {
  const { loadConfig } = await import('./config/config.js');
  console.log(JSON.stringify(loadConfig(), null, 2));
} else if (command === 'start') {
  await import('./index.js');
} else if (command === 'setup-service') {
  const { setupService } = await import('./systemd/setup.js');
  const result = setupService();
  if (result.installed) {
    console.log(`[trade-manager] Systemd service installed (${result.mode})`);
    console.log('[trade-manager] Run: journalctl -u openclaw-trade-manager -f');
  } else {
    console.log(`[trade-manager] ${result.reason}`);
  }
} else if (command === 'remove-service') {
  const { removeService } = await import('./systemd/setup.js');
  const result = removeService();
  if (result.removed) {
    console.log('[trade-manager] Systemd service removed');
  } else {
    console.log(`[trade-manager] ${result.reason}`);
  }
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Usage: trade-manager [version|start|config|setup-service|remove-service]');
  process.exit(1);
}
