import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  port: z.number().int().positive().default(19000),
  pollIntervalSeconds: z.number().int().positive().default(15),
  vincentApiUrl: z.string().url().default('https://heyvincent.ai'),
  vincentApiKey: z.string().min(1), // Will be auto-detected from Polymarket skill if not provided
  databaseUrl: z
    .string()
    .default(`file:${path.join(os.homedir(), '.openclaw', 'trade-manager.db')}`),
  circuitBreakerThreshold: z.number().int().positive().default(5),
  circuitBreakerCooldownSeconds: z.number().int().positive().default(60),
});

export type TradeManagerConfig = z.infer<typeof configSchema>;

const readJsonConfig = (): Record<string, unknown> => {
  const configPath = path.join(os.homedir(), '.openclaw', 'trade-manager.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
};

const readWalletApiKey = (): string | undefined => {
  // Look for Polymarket skill API key files
  // Format: ~/.openclaw/credentials/agentwallet/<API_KEY_ID>.json
  const walletDir = path.join(os.homedir(), '.openclaw', 'credentials', 'agentwallet');

  if (!fs.existsSync(walletDir)) {
    console.log('[Config] No agentwallet directory found, will use config file');
    return undefined;
  }

  try {
    const files = fs.readdirSync(walletDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => {
        // Use the most recently modified file
        const statA = fs.statSync(path.join(walletDir, a));
        const statB = fs.statSync(path.join(walletDir, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    if (files.length === 0) {
      console.log('[Config] No API key files found in agentwallet directory');
      return undefined;
    }

    const keyFile = path.join(walletDir, files[0]);
    const keyData = JSON.parse(fs.readFileSync(keyFile, 'utf8'));

    // The API key might be stored as 'key' or 'apiKey' or just be the string itself
    const apiKey = keyData.key || keyData.apiKey || (typeof keyData === 'string' ? keyData : undefined);

    if (apiKey) {
      console.log(`[Config] Using Polymarket API key from ${files[0]}`);
      return apiKey;
    }

    console.log('[Config] API key file found but no valid key inside');
    return undefined;
  } catch (error) {
    console.error('[Config] Error reading wallet API key:', error);
    return undefined;
  }
};

export const loadConfig = (): TradeManagerConfig => {
  const fileConfig = readJsonConfig();
  const walletApiKey = readWalletApiKey();

  // Priority order for API key:
  // 1. Polymarket skill's saved API key (from agentwallet directory) - PREFERRED
  // 2. Environment variable
  // 3. Config file
  const apiKey = walletApiKey ?? process.env.VINCENT_API_KEY ?? fileConfig.vincentApiKey;

  const parsed = configSchema.parse({
    ...fileConfig,
    port: process.env.PORT ? Number(process.env.PORT) : fileConfig.port,
    pollIntervalSeconds: process.env.POLL_INTERVAL_SECONDS
      ? Number(process.env.POLL_INTERVAL_SECONDS)
      : fileConfig.pollIntervalSeconds,
    vincentApiUrl: process.env.VINCENT_API_URL ?? fileConfig.vincentApiUrl,
    vincentApiKey: apiKey,
    databaseUrl: process.env.DATABASE_URL ?? fileConfig.databaseUrl,
  });

  process.env.DATABASE_URL = parsed.databaseUrl;
  return parsed;
};

export const defaultConfigTemplate = {
  port: 19000,
  pollIntervalSeconds: 15,
  vincentApiUrl: 'https://heyvincent.ai',
  // vincentApiKey is auto-detected from ~/.openclaw/credentials/agentwallet/
  // Only set this if you want to override the Polymarket skill's API key
  vincentApiKey: '', // Optional - will use Polymarket skill's saved API key if not provided
  databaseUrl: 'file:~/.openclaw/trade-manager.db',
};
