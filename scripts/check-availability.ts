import 'dotenv/config';
import { createRequire } from 'module';
import { VPS_PLANS_PRIORITY } from '../src/services/openclaw.service.js';
import { getSubsidiaryForPlan } from '../src/services/ovh.service.js';
const require = createRequire(import.meta.url);
const Ovh = require('@ovhcloud/node-ovh');

async function main() {
  const ovh = Ovh({
    endpoint: process.env.OVH_ENDPOINT || 'ovh-us',
    appKey: process.env.OVH_APP_KEY,
    appSecret: process.env.OVH_APP_SECRET,
    consumerKey: process.env.OVH_CONSUMER_KEY,
  });

  const orderable: { plan: string; dc: string }[] = [];

  // Group plans by subsidiary so we create one cart per subsidiary
  const plansBySubsidiary = new Map<string, string[]>();
  for (const plan of VPS_PLANS_PRIORITY) {
    const sub = getSubsidiaryForPlan(plan);
    if (!plansBySubsidiary.has(sub)) plansBySubsidiary.set(sub, []);
    plansBySubsidiary.get(sub)!.push(plan);
  }

  for (const [subsidiary, plans] of plansBySubsidiary) {
    console.log(`\n--- Subsidiary: ${subsidiary} ---`);

    // Create a cart for this subsidiary
    const cart = await ovh.requestPromised('POST', '/order/cart', {
      ovhSubsidiary: subsidiary,
      description: 'availability check',
    });
    await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/assign`);

    for (const plan of plans) {
      console.log(`\n=== ${plan} (subsidiary: ${subsidiary}) ===`);

      // 1. Stock check
      let stockByDc: Record<string, string> = {};
      try {
        const result = await ovh.requestPromised(
          'GET',
          `/vps/order/rule/datacenter?ovhSubsidiary=${subsidiary}&planCode=${plan}`,
        );
        if (result?.datacenters) {
          for (const dc of result.datacenters) {
            stockByDc[dc.datacenter] = dc.linuxStatus;
          }
        }
      } catch (e: any) {
        console.log(`  Stock API error: ${e.message?.slice(0, 200)}`);
      }

      // 2. Cart allowed DCs
      let allowedDcs: string[] = [];
      try {
        const item = await ovh.requestPromised('POST', `/order/cart/${cart.cartId}/vps`, {
          duration: 'P1M',
          planCode: plan,
          pricingMode: 'default',
          quantity: 1,
        });
        const reqConfig = await ovh.requestPromised(
          'GET',
          `/order/cart/${cart.cartId}/item/${item.itemId}/requiredConfiguration`,
        );
        const dcConfig = reqConfig.find((c: any) => c.label.includes('datacenter'));
        allowedDcs = dcConfig?.allowedValues || [];
        await ovh.requestPromised('DELETE', `/order/cart/${cart.cartId}/item/${item.itemId}`);
      } catch (e: any) {
        console.log(`  Cart API error: ${e.message?.slice(0, 200)}`);
      }

      // 3. Cross-reference
      const allowedSet = new Set(allowedDcs);
      const allDcs = new Set([...Object.keys(stockByDc), ...allowedDcs]);

      for (const dc of [...allDcs].sort()) {
        const stock = stockByDc[dc] || 'unknown';
        const allowed = allowedSet.has(dc);
        const canOrder = stock === 'available' && allowed;
        const tag = canOrder ? 'ORDERABLE' : stock !== 'available' ? `no stock (${stock})` : 'not allowed for plan';
        console.log(`  ${dc}: ${tag}`);
        if (canOrder) orderable.push({ plan, dc });
      }
    }
  }

  // Summary
  console.log('\n\n========================================');
  console.log('SUMMARY — orderable plan + DC combos:');
  console.log('========================================');
  if (orderable.length === 0) {
    console.log('  NONE — all plans are out of stock in their allowed datacenters');
  } else {
    for (const { plan, dc } of orderable) {
      console.log(`  ${plan} @ ${dc}`);
    }
  }
  console.log();
}

main().catch(console.error);
