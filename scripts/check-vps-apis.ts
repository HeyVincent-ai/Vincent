/**
 * Check available OVH API endpoints for the VPS.
 * Run: npx tsx scripts/check-vps-apis.ts
 */
import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ovh = require('@ovhcloud/node-ovh');

const VPS_NAME = 'vps-afe8726c.vps.ovh.us';

async function main() {
  const ovh = Ovh({
    endpoint: process.env.OVH_ENDPOINT || 'ovh-us',
    appKey: process.env.OVH_APP_KEY,
    appSecret: process.env.OVH_APP_SECRET,
    consumerKey: process.env.OVH_CONSUMER_KEY,
  });

  // Check rebuild endpoint details
  console.log('=== VPS Details ===');
  const details = await ovh.requestPromised('GET', `/vps/${VPS_NAME}`);
  console.log(JSON.stringify(details, null, 2));

  // Check available images
  console.log('\n=== Available Images ===');
  try {
    const images = await ovh.requestPromised('GET', `/vps/${VPS_NAME}/images/available`);
    console.log(JSON.stringify(images.slice(0, 3), null, 2));
    // Find Ubuntu 24.04
    const ubuntu = images.find((i: any) => i.name?.includes('Ubuntu') && i.name?.includes('24'));
    if (ubuntu) console.log('\nUbuntu 24.04 image:', JSON.stringify(ubuntu, null, 2));
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Check if there's a startup script endpoint
  console.log('\n=== Check startup script endpoints ===');
  const endpoints = [
    `/vps/${VPS_NAME}/automatedBackup`,
    `/vps/${VPS_NAME}/option`,
  ];
  for (const ep of endpoints) {
    try {
      const result = await ovh.requestPromised('GET', ep);
      console.log(`${ep}: ${JSON.stringify(result).slice(0, 200)}`);
    } catch (e: any) {
      console.log(`${ep}: ${e.message?.slice(0, 100)}`);
    }
  }

  // Check SSH keys on account
  console.log('\n=== SSH Keys on Account ===');
  const keys = await ovh.requestPromised('GET', '/me/sshKey');
  console.log('Key names:', keys);
  for (const keyName of keys) {
    const keyDetails = await ovh.requestPromised('GET', `/me/sshKey/${keyName}`);
    console.log(`  ${keyName}: ${keyDetails.key?.slice(0, 60)}...`);
  }

  // Try to get the rebuild API schema
  console.log('\n=== Rebuild API models ===');
  try {
    // Check what the rebuild endpoint expects
    const models = await ovh.requestPromised('GET', `/vps/${VPS_NAME}/images/current`);
    console.log('Current image:', JSON.stringify(models, null, 2));
  } catch (e: any) {
    console.log('Current image error:', e.message);
  }
}

main().catch(console.error);
