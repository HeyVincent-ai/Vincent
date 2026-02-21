import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { KeyData, SecretType } from './types.js';

const TYPE_DIRS: Record<string, string> = {
  EVM_WALLET: 'agentwallet',
  POLYMARKET_WALLET: 'agentwallet',
  RAW_SIGNER: 'agentwallet',
  DATA_SOURCES: 'datasources',
};

function getCredentialsRoot(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw');
  return join(stateDir, 'credentials');
}

function getDirForType(type: SecretType): string {
  const subdir = TYPE_DIRS[type];
  if (!subdir) {
    throw new Error(`Unknown secret type: ${type}`);
  }
  return join(getCredentialsRoot(), subdir);
}

export function storeKey(keyData: KeyData): void {
  const dir = getDirForType(keyData.type);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${keyData.id}.json`);
  writeFileSync(filePath, JSON.stringify(keyData, null, 2) + '\n');
}

export function getKey(keyId: string): string {
  const root = getCredentialsRoot();
  for (const subdir of ['agentwallet', 'datasources']) {
    const filePath = join(root, subdir, `${keyId}.json`);
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf-8')) as KeyData;
      return data.apiKey;
    }
  }
  console.error(`Key not found: ${keyId}`);
  console.error(`Searched in: ${root}/agentwallet/ and ${root}/datasources/`);
  process.exit(1);
}

export function getKeyData(keyId: string): KeyData {
  const root = getCredentialsRoot();
  for (const subdir of ['agentwallet', 'datasources']) {
    const filePath = join(root, subdir, `${keyId}.json`);
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as KeyData;
    }
  }
  console.error(`Key not found: ${keyId}`);
  console.error(`Searched in: ${root}/agentwallet/ and ${root}/datasources/`);
  process.exit(1);
}

export function listKeys(type?: SecretType): KeyData[] {
  const root = getCredentialsRoot();
  const keys: KeyData[] = [];
  const subdirs = type ? [TYPE_DIRS[type]] : ['agentwallet', 'datasources'];

  for (const subdir of subdirs) {
    if (!subdir) continue;
    const dir = join(root, subdir);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as KeyData;
        if (!type || data.type === type) {
          keys.push(data);
        }
      } catch {
        // skip malformed files
      }
    }
  }

  return keys;
}

export function findKey(type: SecretType): string {
  const keys = listKeys(type);
  if (keys.length === 0) {
    console.error(`No ${type} key found. Create one with: vincent secret create --type ${type}`);
    process.exit(1);
  }
  if (keys.length > 1) {
    console.error(`Multiple ${type} keys found. Specify one with --key-id:`);
    for (const k of keys) {
      console.error(`  ${k.id} — ${k.memo}`);
    }
    process.exit(1);
  }
  return keys[0].apiKey;
}

export function resolveApiKey(flags: Record<string, string | boolean>, type: SecretType): string {
  const keyId = flags['key-id'];
  if (typeof keyId === 'string') {
    return getKey(keyId);
  }
  return findKey(type);
}
