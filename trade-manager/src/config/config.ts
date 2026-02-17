import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  port: z.number().int().positive().default(19000),
  pollIntervalSeconds: z.number().int().positive().default(60), // Reduced default since WebSocket is primary
  vincentApiUrl: z.string().url().default('https://heyvincent.ai'),
  vincentApiKey: z.string().min(1), // Required - must be from Polymarket skill's saved wallet
  databaseUrl: z
    .string()
    .default(`file:${path.join(os.homedir(), '.openclaw', 'trade-manager.db')}`),
  circuitBreakerThreshold: z.number().int().positive().default(5),
  circuitBreakerCooldownSeconds: z.number().int().positive().default(60),
  // WebSocket configuration
  enableWebSocket: z.boolean().default(true),
  webSocketUrl: z.string().url().default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  webSocketReconnectInitialDelay: z.number().int().positive().default(1000),
  webSocketReconnectMaxDelay: z.number().int().positive().default(60000),
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

  // IMPORTANT: Trade Manager REQUIRES a Polymarket wallet from the Polymarket skill
  // We do NOT accept API keys from config file or environment variables
  // This ensures there's only one source of truth for the wallet
  if (!walletApiKey) {
    throw new Error(
      '❌ No Polymarket wallet found!\n\n' +
        'Trade Manager requires a Polymarket wallet created via the Polymarket skill.\n\n' +
        'Please use the Polymarket skill to either:\n' +
        '  1. Create a new wallet: POST /api/secrets with type "POLYMARKET_WALLET"\n' +
        '  2. Re-link an existing wallet: POST /api/secrets/relink with your re-link token\n\n' +
        'The API key will be automatically saved to:\n' +
        '  ~/.openclaw/credentials/agentwallet/<api-key-id>.json\n\n' +
        'Once you have a Polymarket wallet set up, Trade Manager will automatically detect it.'
    );
  }

  const parsed = configSchema.parse({
    ...fileConfig,
    port: process.env.PORT ? Number(process.env.PORT) : fileConfig.port,
    pollIntervalSeconds: process.env.POLL_INTERVAL_SECONDS
      ? Number(process.env.POLL_INTERVAL_SECONDS)
      : fileConfig.pollIntervalSeconds,
    vincentApiUrl: process.env.VINCENT_API_URL ?? fileConfig.vincentApiUrl,
    vincentApiKey: walletApiKey, // Only from Polymarket skill
    databaseUrl: process.env.DATABASE_URL ?? fileConfig.databaseUrl,
    enableWebSocket: process.env.ENABLE_WEBSOCKET === 'false' ? false : fileConfig.enableWebSocket,
    webSocketUrl: process.env.WEBSOCKET_URL ?? fileConfig.webSocketUrl,
  });

  process.env.DATABASE_URL = parsed.databaseUrl;
  return parsed;
};

export const defaultConfigTemplate = {
  port: 19000,
  pollIntervalSeconds: 60, // Reduced since WebSocket provides real-time updates
  vincentApiUrl: 'https://heyvincent.ai',
  // vincentApiKey is NOT configurable here
  // It's automatically loaded from ~/.openclaw/credentials/agentwallet/
  // You must use the Polymarket skill to create/link a wallet first
  databaseUrl: 'file:~/.openclaw/trade-manager.db',
  enableWebSocket: true,
  webSocketUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
  webSocketReconnectInitialDelay: 1000,
  webSocketReconnectMaxDelay: 60000,
};
