/**
 * Quick script to check VPS status and IPs.
 * Run: npx tsx scripts/check-vps.ts
 */

import 'dotenv/config';
import * as ovhService from '../src/services/ovh.service.js';

async function main() {
  const vpsList = await ovhService.listVps();
  console.log(`VPS instances: ${vpsList.length}`);

  for (const name of vpsList) {
    console.log(`\n--- ${name} ---`);
    const details = await ovhService.getVpsDetails(name);
    console.log(`  State: ${details.state}`);
    console.log(`  IPs (from details): ${details.ips.join(', ') || 'none'}`);
    console.log(`  vCores: ${details.vcore}, Memory: ${details.memory}MB`);
    console.log(`  Zone: ${details.zone}`);

    const ips = await ovhService.getVpsIps(name);
    console.log(`  IPs (from /ips): ${ips.join(', ') || 'none'}`);
  }
}

main().catch(console.error);
