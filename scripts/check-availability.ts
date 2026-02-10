import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ovh = require('@ovhcloud/node-ovh');

async function main() {
  const ovh = Ovh({
    endpoint: process.env.OVH_ENDPOINT || 'ovh-us',
    appKey: process.env.OVH_APP_KEY,
    appSecret: process.env.OVH_APP_SECRET,
    consumerKey: process.env.OVH_CONSUMER_KEY,
  });

  const plans = ['vps-2025-model1', 'vps-2025-model2', 'vps-2025-model3'];
  
  for (const plan of plans) {
    console.log(`\n=== ${plan} ===`);
    try {
      const result = await ovh.requestPromised('GET', `/vps/order/rule/datacenter?ovhSubsidiary=US&planCode=${plan}`);
      if (result?.datacenters) {
        for (const dc of result.datacenters) {
          console.log(`  ${dc.datacenter} — linux: ${dc.linuxStatus}, windows: ${dc.windowsStatus}, days: ${dc.daysBeforeDelivery}`);
        }
      } else {
        console.log(`  Response: ${JSON.stringify(result).slice(0, 300)}`);
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
    }
  }

  // Also check with CA subsidiary
  console.log('\n\n=== Checking with ovhSubsidiary=CA ===');
  for (const plan of plans) {
    console.log(`\n=== ${plan} (CA) ===`);
    try {
      const result = await ovh.requestPromised('GET', `/vps/order/rule/datacenter?ovhSubsidiary=CA&planCode=${plan}`);
      if (result?.datacenters) {
        for (const dc of result.datacenters) {
          console.log(`  ${dc.datacenter} — linux: ${dc.linuxStatus}, windows: ${dc.windowsStatus}, days: ${dc.daysBeforeDelivery}`);
        }
      }
    } catch (e: any) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
    }
  }

  // Check what cart looks like with CA datacenter options
  console.log('\n\n=== Cart datacenter options (US subsidiary) ===');
  const cart = await ovh.requestPromised('POST', '/order/cart', {
    ovhSubsidiary: 'US',
    description: 'availability check',
  });
  await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/assign`);
  
  for (const plan of plans) {
    console.log(`\n--- ${plan} ---`);
    try {
      const item = await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/vps`, {
        duration: 'P1M',
        planCode: plan,
        pricingMode: 'default',
        quantity: 1,
      });
      const reqConfig = await ovh.requestPromised('GET', `/order/cart/${cart.cartId}/item/${item.itemId}/requiredConfiguration`);
      const dcConfig = reqConfig.find((c: any) => c.label.includes('datacenter'));
      if (dcConfig) {
        console.log(`  Allowed datacenters: ${dcConfig.allowedValues?.join(', ')}`);
      }
      const osConfig = reqConfig.find((c: any) => c.label.includes('os'));
      if (osConfig) {
        console.log(`  Allowed OS: ${osConfig.allowedValues?.join(', ')}`);
      }
      // Remove item so we can add the next plan
      await ovh.requestPromised('DELETE', `/order/cart/${cart.cartId}/item/${item.itemId}`);
    } catch (e: any) {
      console.log(`  Error: ${e.message?.slice(0, 200)}`);
    }
  }
}

main().catch(console.error);
