/**
 * OVH Consumer Key Authorization Script
 *
 * Creates a new consumer key with full permissions needed for OpenClaw VPS management.
 * Run: npx tsx scripts/ovh-auth.ts
 *
 * After running, visit the validation URL and update OVH_CONSUMER_KEY in .env
 */

import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ovh = require('@ovhcloud/node-ovh');

const appKey = process.env.OVH_APP_KEY;
const appSecret = process.env.OVH_APP_SECRET;

if (!appKey || !appSecret) {
  console.error('OVH_APP_KEY and OVH_APP_SECRET must be set in .env');
  process.exit(1);
}

const client = Ovh({
  endpoint: process.env.OVH_ENDPOINT || 'ovh-us',
  appKey,
  appSecret,
  consumerKey: '', // Empty — we're requesting a new one
});

// Request a consumer key with all needed permissions
client.request(
  'POST',
  '/auth/credential',
  {
    accessRules: [
      // Account info
      { method: 'GET', path: '/me' },
      { method: 'GET', path: '/me/*' },
      // Orders
      { method: 'GET', path: '/order/*' },
      { method: 'POST', path: '/order/*' },
      { method: 'DELETE', path: '/order/*' },
      // My orders
      { method: 'GET', path: '/me/order/*' },
      { method: 'POST', path: '/me/order/*' },
      // VPS management
      { method: 'GET', path: '/vps' },
      { method: 'GET', path: '/vps/*' },
      { method: 'POST', path: '/vps/*' },
      { method: 'PUT', path: '/vps/*' },
      { method: 'DELETE', path: '/vps/*' },
      // SSH keys
      { method: 'GET', path: '/me/sshKey' },
      { method: 'GET', path: '/me/sshKey/*' },
      { method: 'POST', path: '/me/sshKey' },
      { method: 'PUT', path: '/me/sshKey/*' },
      { method: 'DELETE', path: '/me/sshKey/*' },
    ],
  },
  (err: any, credential: any) => {
    if (err) {
      console.error('Error requesting credential:', err);
      process.exit(1);
    }

    console.log('\n========================================');
    console.log('  OVH Consumer Key Authorization');
    console.log('========================================\n');
    console.log(`Consumer Key: ${credential.consumerKey}`);
    console.log(`\nValidation URL: ${credential.validationUrl}`);
    console.log(`\n1. Visit the URL above to authorize the key`);
    console.log(`2. Choose "Unlimited" validity`);
    console.log(`3. Update OVH_CONSUMER_KEY in your .env file with: ${credential.consumerKey}`);
    console.log('\n========================================\n');
  }
);
