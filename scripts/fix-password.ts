/**
 * Fix the password-expired issue on a freshly rebuilt OVH VPS.
 * Run: npx tsx scripts/fix-password.ts
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client: SshClient } = require('ssh2');

const VPS_IP = '51.81.223.26';
const KEY_FILE = '/Users/chris/Documents/WorkStuff/Lit/skills/SafeSkills/.e2e-keys/openclaw-rebuild-1770348036995';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const privateKey = readFileSync(KEY_FILE, 'utf-8');

  // Strategy: Use PTY shell, interrupt password change with Ctrl+C, then use sudo
  console.log('Connecting with shell+PTY, will try Ctrl+C to break password change...');

  const result = await new Promise<string>((resolve, reject) => {
    const conn = new SshClient();
    const timer = setTimeout(() => { conn.end(); reject(new Error('Timeout')); }, 30_000);
    let output = '';
    let stage = 'initial';
    let commandsSent = false;

    conn.on('ready', () => {
      console.log('  Connected!');
      conn.shell({ term: 'xterm', rows: 40, cols: 80 }, (err: any, stream: any) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }

        stream.on('data', (data: Buffer) => {
          const chunk = data.toString();
          output += chunk;
          // Don't print raw terminal data, just key events
          const clean = chunk.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
          if (clean) process.stdout.write(`  [${stage}] ${clean}\n`);

          if (stage === 'initial' && (chunk.includes('Current password:') || chunk.includes('password:'))) {
            stage = 'interrupting';
            console.log('  Sending Ctrl+C to interrupt password change...');
            stream.write('\x03'); // Ctrl+C
            setTimeout(() => {
              console.log('  Sending another Ctrl+C...');
              stream.write('\x03');
              setTimeout(() => {
                // Try to get a shell
                console.log('  Trying to get shell via Ctrl+Z + sudo...');
                stream.write('\x1a'); // Ctrl+Z
                setTimeout(() => {
                  stream.write('sudo bash\n');
                  stage = 'sudo';
                }, 500);
              }, 500);
            }, 500);
          } else if (stage === 'sudo' && (chunk.includes('#') || chunk.includes('$')) && !commandsSent) {
            commandsSent = true;
            stage = 'fixing';
            console.log('  Got prompt! Fixing password...');
            stream.write('chage -d 2026-02-06 ubuntu && chage -M 99999 ubuntu && echo "FIXED"\n');
          } else if (chunk.includes('FIXED')) {
            clearTimeout(timer);
            stream.write('exit\n');
            setTimeout(() => { conn.end(); resolve('fixed'); }, 500);
          }
        });

        stream.on('close', () => {
          clearTimeout(timer);
          conn.end();
          resolve(output);
        });
      });
    });

    conn.on('error', (err: any) => { clearTimeout(timer); reject(err); });
    conn.connect({ host: VPS_IP, port: 22, username: 'ubuntu', privateKey, readyTimeout: 15_000 });
  });

  console.log(`\nResult: ${typeof result === 'string' ? result.slice(0, 100) : result}`);

  // Alternative: try using root user directly. Some OVH images also add key to root.
  console.log('\n\n--- Alternative: Try root user ---');
  try {
    const rootResult = await new Promise<string>((resolve, reject) => {
      const conn = new SshClient();
      const timer = setTimeout(() => { conn.end(); reject(new Error('Timeout')); }, 15_000);

      conn.on('ready', () => {
        conn.exec('hostname && whoami', (err: any, stream: any) => {
          if (err) { clearTimeout(timer); conn.end(); return reject(err); }
          let out = '';
          stream.on('data', (d: Buffer) => { out += d.toString(); });
          stream.stderr.on('data', (d: Buffer) => { out += d.toString(); });
          stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(out.trim()); });
        });
      });

      conn.on('error', (err: any) => { clearTimeout(timer); reject(err); });
      conn.connect({ host: VPS_IP, port: 22, username: 'root', privateKey, readyTimeout: 15_000 });
    });
    console.log(`Root exec: ${rootResult}`);
  } catch (err: any) {
    console.log(`Root exec failed: ${err.message}`);
  }

  // Alternative: Try Debian image - different OS might not force password change
  console.log('\n--- Suggestion: Try rebuilding with Debian 12 which may not force password change ---');
  console.log('Debian 12 image: d1453b53-7a9f-4842-9e79-41f3dda0e37d');

  // Final test
  console.log('\n--- Final test: Ubuntu SSH ---');
  try {
    const testResult = await new Promise<string>((resolve, reject) => {
      const conn = new SshClient();
      const timer = setTimeout(() => { conn.end(); reject(new Error('Timeout')); }, 10_000);

      conn.on('ready', () => {
        conn.exec('hostname && uname -a', (err: any, stream: any) => {
          if (err) { clearTimeout(timer); conn.end(); return reject(err); }
          let out = '';
          stream.on('data', (d: Buffer) => { out += d.toString(); });
          stream.stderr.on('data', (d: Buffer) => { out += d.toString(); });
          stream.on('close', () => { clearTimeout(timer); conn.end(); resolve(out.trim()); });
        });
      });

      conn.on('error', (err: any) => { clearTimeout(timer); reject(err); });
      conn.connect({ host: VPS_IP, port: 22, username: 'ubuntu', privateKey, readyTimeout: 15_000 });
    });
    console.log(`SSH test: ${testResult}`);
  } catch (err: any) {
    console.log(`SSH test: ${err.message}`);
  }
}

main().catch(console.error);
