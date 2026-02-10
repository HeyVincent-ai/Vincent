/**
 * List available VPS images with names.
 * Run: npx tsx scripts/list-images.ts
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

  const imageIds: string[] = await ovh.requestPromised('GET', `/vps/${VPS_NAME}/images/available`);
  console.log(`Found ${imageIds.length} images\n`);

  for (const id of imageIds) {
    try {
      const img = await ovh.requestPromised('GET', `/vps/${VPS_NAME}/images/available/${id}`);
      console.log(`${img.id}  ${img.name}`);
    } catch (e: any) {
      console.log(`${id}  (error: ${e.message?.slice(0, 80)})`);
    }
  }
}

main().catch(console.error);
