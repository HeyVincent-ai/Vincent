#!/usr/bin/env node
import { loadConfig } from './config/config.js';

const command = process.argv[2] ?? 'version';

if (command === 'version') {
  console.log('0.1.0');
} else if (command === 'config') {
  console.log(JSON.stringify(loadConfig(), null, 2));
} else if (command === 'start') {
  await import('./index.js');
} else if (command === 'setup-service') {
  const { setupService } = await import('./systemd/setup.js');
  const result = setupService();
  if (result.installed) {
    console.log(`[trade-manager] Systemd service installed (${result.mode})`);
    console.log('[trade-manager] Run: journalctl --user -u openclaw-trade-manager -f');
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
  process.exit(1);
}
