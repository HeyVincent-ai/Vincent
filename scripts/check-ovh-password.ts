/**
 * Check if OVH API provides the VPS installation password.
 * Run: npx tsx scripts/check-ovh-password.ts
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

  // Check tasks for the rebuild
  console.log('=== Recent VPS Tasks ===');
  try {
    const tasks = await ovh.requestPromised('GET', `/vps/${VPS_NAME}/tasks`);
    console.log(`Task IDs: ${JSON.stringify(tasks)}`);
    for (const taskId of tasks.slice(-5)) {
      const task = await ovh.requestPromised('GET', `/vps/${VPS_NAME}/tasks/${taskId}`);
      console.log(`  Task ${taskId}: ${JSON.stringify(task)}`);
    }
  } catch (e: any) {
    console.log(`  Tasks error: ${e.message}`);
  }

  // Check if there's a way to get or reset the password
  console.log('\n=== Check password-related endpoints ===');
  const endpoints = [
    [`GET`, `/vps/${VPS_NAME}`],
    [`GET`, `/vps/${VPS_NAME}/distribution`],
    [`GET`, `/vps/${VPS_NAME}/distribution/software`],
  ];

  for (const [method, ep] of endpoints) {
    try {
      const result = await ovh.requestPromised(method, ep);
      console.log(`${method} ${ep}: ${JSON.stringify(result).slice(0, 300)}`);
    } catch (e: any) {
      console.log(`${method} ${ep}: ${e.message?.slice(0, 100)}`);
    }
  }

  // Check rebuild API schema - maybe there's a password param
  console.log('\n=== Try to get VPS API schema ===');
  try {
    // Check the latest rebuild task for password info
    const tasks = await ovh.requestPromised('GET', `/vps/${VPS_NAME}/tasks`);
    const latestTask = tasks[tasks.length - 1];
    if (latestTask) {
      const taskDetail = await ovh.requestPromised('GET', `/vps/${VPS_NAME}/tasks/${latestTask}`);
      console.log(`Latest task detail: ${JSON.stringify(taskDetail, null, 2)}`);
    }
  } catch (e: any) {
    console.log(`  Error: ${e.message}`);
  }

  // Try to set a new password via API
  console.log('\n=== Try password reset endpoint ===');
  try {
    const result = await ovh.requestPromised('POST', `/vps/${VPS_NAME}/setPassword`);
    console.log(`setPassword: ${JSON.stringify(result)}`);
  } catch (e: any) {
    console.log(`setPassword: ${e.message?.slice(0, 200)}`);
  }

  // Check if root password is accessible via a different method
  console.log('\n=== Check for root password access ===');
  try {
    const result = await ovh.requestPromised('POST', `/vps/${VPS_NAME}/getConsoleUrl`);
    console.log(`Console URL: ${JSON.stringify(result)}`);
  } catch (e: any) {
    console.log(`Console URL: ${e.message?.slice(0, 200)}`);
  }
}

main().catch(console.error);
