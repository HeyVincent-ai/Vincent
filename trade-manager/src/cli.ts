#!/usr/bin/env node
import { loadConfig } from './config/config.js';

const command = process.argv[2] ?? 'version';

if (command === 'version') {
  console.log('0.1.0');
} else if (command === 'config') {
  console.log(JSON.stringify(loadConfig(), null, 2));
} else if (command === 'start') {
  await import('./index.js');
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
