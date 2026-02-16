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

  // Create cart to list all plan codes
  const cart = await ovh.requestPromised('POST', '/order/cart', {
    ovhSubsidiary: 'US',
    description: 'plan check',
  });
  await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/assign`);

  const plans = await ovh.requestPromised('GET', `/order/cart/${cart.cartId}/vps`);
  console.log(`Total plans available: ${plans.length}\n`);

  // Group by model
  const planCodes = plans.map((p: any) => p.planCode).sort();
  console.log('All plan codes:');
  planCodes.forEach((p: string) => console.log(`  ${p}`));

  // Now check datacenters for the interesting ones
  const targetPlans = planCodes.filter(
    (p: string) => p.includes('model1') || p.includes('model2') || p.includes('model3')
  );

  console.log(`\n\nChecking datacenter availability for ${targetPlans.length} plans:\n`);

  for (const plan of targetPlans) {
    try {
      const item = await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/vps`, {
        duration: 'P1M',
        planCode: plan,
        pricingMode: 'default',
        quantity: 1,
      });
      const reqConfig = await ovh.requestPromised(
        'GET',
        `/order/cart/${cart.cartId}/item/${item.itemId}/requiredConfiguration`
      );
      const dcConfig = reqConfig.find((c: any) => c.label.includes('datacenter'));
      const datacenters = dcConfig?.allowedValues || [];
      console.log(`${plan}: ${datacenters.join(', ') || 'none'}`);

      // Check stock for each datacenter
      try {
        const dcRule = await ovh.requestPromised(
          'GET',
          `/vps/order/rule/datacenter?ovhSubsidiary=US&planCode=${plan}`
        );
        if (dcRule?.datacenters) {
          for (const dc of dcRule.datacenters) {
            const status = dc.linuxStatus === 'available' ? '✓ AVAILABLE' : `✗ ${dc.linuxStatus}`;
            console.log(`  ${dc.datacenter}: ${status} (${dc.daysBeforeDelivery} days)`);
          }
        }
      } catch {}

      await ovh.requestPromised('DELETE', `/order/cart/${cart.cartId}/item/${item.itemId}`);
    } catch (e: any) {
      console.log(`${plan}: ERROR - ${e.message?.slice(0, 100)}`);
    }
  }
}

main().catch(console.error);
