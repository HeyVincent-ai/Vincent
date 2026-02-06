/**
 * Rebuild existing VPS with Debian 12 + registered SSH key name and verify SSH.
 * This tests the same flow the e2e test uses (sshKey = registered key name).
 * Run: npx tsx scripts/rebuild-and-ssh.ts
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client: SshClient, utils } = require('ssh2');
import * as ovhService from '../src/services/ovh.service.js';

const VPS_NAME = 'vps-afe8726c.vps.ovh.us';
const VPS_IP = '51.81.223.26';
const DEBIAN_12_IMAGE_ID = 'd1453b53-7a9f-4842-9e79-41f3dda0e37d';
const SSH_USERNAMES = ['root', 'debian'];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function trySsh(host: string, username: string, privateKey: string, command = 'echo ok'): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('SSH connect timeout'));
    }, 20_000);

    conn.on('ready', () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        let out = '';
        stream.on('data', (d: Buffer) => { out += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { out += d.toString(); });
        stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(out.trim()); });
      });
    });

    conn.on('error', (err: any) => { clearTimeout(timer); reject(err); });

    conn.connect({
      host,
      port: 22,
      username,
      privateKey,
      readyTimeout: 15_000,
    });
  });
}

async function main() {
  // 1. Generate RSA SSH key pair (OVH /me/sshKey does NOT support ed25519)
  console.log('Generating RSA 4096 SSH key pair...');
  const keys = utils.generateKeyPairSync('rsa', {
    bits: 4096,
    comment: 'openclaw-rebuild',
  });
  const sshPub: string = keys.public;
  const sshPriv: string = keys.private;
  console.log(`  Public key: ${sshPub.slice(0, 60)}...`);

  // Save private key
  const keyDir = join(process.cwd(), '.e2e-keys');
  mkdirSync(keyDir, { recursive: true });
  const keyFile = join(keyDir, `openclaw-rebuild-${Date.now()}`);
  writeFileSync(keyFile, sshPriv, { mode: 0o600 });
  console.log(`  Key saved: ${keyFile}`);

  // 2. Clean up old SSH keys and register new one
  console.log('\nRegistering SSH key with OVH...');
  const existingKeys = await ovhService.listSshKeys();
  console.log(`  Existing keys: ${existingKeys.join(', ') || 'none'}`);

  for (const oldKey of existingKeys) {
    if (oldKey.startsWith('openclaw-')) {
      try {
        await ovhService.deleteSshKey(oldKey);
        console.log(`  Deleted old key: ${oldKey}`);
      } catch (err: any) {
        console.log(`  Failed to delete ${oldKey}: ${err.message}`);
      }
    }
  }

  const keyName = `openclaw-rebuild-${Date.now()}`;
  await ovhService.addSshKey(keyName, sshPub);
  console.log(`  Registered as: ${keyName}`);

  // 3. Rebuild with Debian 12 + publicSshKey + doNotSendPassword
  // doNotSendPassword might prevent password setup entirely when combined with publicSshKey
  console.log(`\nRebuilding VPS with Debian 12 (${DEBIAN_12_IMAGE_ID})...`);
  console.log(`  Using publicSshKey + doNotSendPassword:true`);

  const ovh = (await import('@ovhcloud/node-ovh')).default;
  const client = ovh({
    endpoint: process.env.OVH_ENDPOINT || 'ovh-us',
    appKey: process.env.OVH_APP_KEY,
    appSecret: process.env.OVH_APP_SECRET,
    consumerKey: process.env.OVH_CONSUMER_KEY,
  });
  const result = await client.requestPromised('POST', `/vps/${VPS_NAME}/rebuild`, {
    imageId: DEBIAN_12_IMAGE_ID,
    publicSshKey: sshPub,
    doNotSendPassword: true,
  });
  console.log(`  Rebuild initiated: task ${result.id}, state: ${result.state}`);

  // 4. Wait for rebuild
  console.log('\nWaiting for VPS rebuild...');
  let wasInstalling = false;
  for (let i = 0; i < 30; i++) {
    await sleep(15_000);
    try {
      const details = await ovhService.getVpsDetails(VPS_NAME);
      console.log(`  [${(i + 1) * 15}s] State: ${details.state}`);
      if (details.state === 'installing') wasInstalling = true;
      if (details.state === 'running' && wasInstalling) {
        console.log('  VPS running. Waiting 30s for SSH...');
        await sleep(30_000);
        break;
      }
    } catch (e: any) {
      console.log(`  [${(i + 1) * 15}s] ${e.message || 'error'}`);
    }
  }

  // 5. Try SSH with multiple usernames
  for (const username of SSH_USERNAMES) {
    console.log(`\nTrying SSH as ${username}@${VPS_IP}...`);
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const out = await trySsh(
          VPS_IP, username, sshPriv,
          'hostname && whoami && uname -a && cat /etc/os-release | head -3 && echo "---" && cat ~/.ssh/authorized_keys 2>/dev/null | head -1 || echo "no authorized_keys"'
        );
        console.log(`\n========================================`);
        console.log(`  SSH SUCCESS as ${username}!`);
        console.log(`========================================`);
        console.log(out);
        console.log(`\nConnect with:\n  ssh -i ${keyFile} ${username}@${VPS_IP}`);
        console.log(`========================================`);
        return;
      } catch (err: any) {
        console.log(`  Attempt ${attempt + 1}/8: ${err.message}`);
      }
      await sleep(10_000);
    }
  }

  console.log('\nSSH failed for all users.');
  console.log(`Key file: ${keyFile}`);
}

main().catch(console.error);
