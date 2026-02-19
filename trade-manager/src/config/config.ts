import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  port: z.number().int().positive().default(19000),
  pollIntervalSeconds: z.number().int().positive().default(60), // Reduced default since WebSocket is primary
  vincentApiUrl: z.string().url().default('https://heyvincent.ai'),
  vincentApiKey: z.string().min(1), // Required - must be from Polymarket skill's saved wallet
  databaseUrl: z.string().min(1),
  circuitBreakerThreshold: z.number().int().positive().default(5),
  circuitBreakerCooldownSeconds: z.number().int().positive().default(60),
  // WebSocket configuration
  enableWebSocket: z.boolean().default(true),
  webSocketUrl: z.string().url().default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  webSocketReconnectInitialDelay: z.number().int().positive().default(1000),
  webSocketReconnectMaxDelay: z.number().int().positive().default(60000),
  // HTTPS via Caddy
  httpsEnabled: z.boolean().default(true),
  httpsPort: z.number().int().positive().default(19443),
  caddyfilePath: z.string().default('/etc/caddy/Caddyfile'),
});

export type TradeManagerConfig = z.infer<typeof configSchema>;

/**
 * Resolve the base .openclaw directory. Honors OPENCLAW_HOME env var,
 * then falls back to $HOME/.openclaw.
 */
const openclawHome = (): string =>
  process.env.OPENCLAW_HOME ?? path.join(os.homedir(), '.openclaw');

const readJsonConfig = (): Record<string, unknown> => {
  const configPath = path.join(openclawHome(), 'trade-manager.json');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
};

/**
 * Return candidate wallet directories in priority order.
 * 1. $OPENCLAW_HOME/credentials/agentwallet  (explicit override)
 * 2. $HOME/.openclaw/credentials/agentwallet (normal path)
 * 3. /root/.openclaw/credentials/agentwallet (fallback for global installs
 *    where the service user differs from the user who created the wallet)
 */
const walletSearchPaths = (): string[] => {
  const seen = new Set<string>();
  const paths: string[] = [];
  const push = (p: string) => {
    if (!seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  };

  push(path.join(openclawHome(), 'credentials', 'agentwallet'));

  const homeBased = path.join(os.homedir(), '.openclaw', 'credentials', 'agentwallet');
  push(homeBased);

  push('/root/.openclaw/credentials/agentwallet');

  return paths;
};

const readWalletApiKey = (): string | undefined => {
  const candidates = walletSearchPaths();
  console.log(`[Config] Searching for agentwallet in: ${candidates.join(', ')}`);

  for (const walletDir of candidates) {
    const result = readWalletFromDir(walletDir);
    if (result !== undefined) return result;
  }

  console.log('[Config] No agentwallet directory found in any search path');
  return undefined;
};

const readWalletFromDir = (walletDir: string): string | undefined => {
  if (!fs.existsSync(walletDir)) {
    return undefined;
  }

  try {
    const files = fs
      .readdirSync(walletDir)
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(walletDir, a));
        const statB = fs.statSync(path.join(walletDir, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    if (files.length === 0) {
      console.log(`[Config] No API key files in ${walletDir}`);
      return undefined;
    }

    const keyFile = path.join(walletDir, files[0]);
    const keyData = JSON.parse(fs.readFileSync(keyFile, 'utf8'));

    const apiKey =
      keyData.key || keyData.apiKey || (typeof keyData === 'string' ? keyData : undefined);

    if (apiKey) {
      console.log(`[Config] Using Polymarket API key from ${keyFile}`);
      return apiKey;
    }

    console.log(`[Config] API key file found in ${walletDir} but no valid key inside`);
    return undefined;
  } catch (error) {
    console.error(`[Config] Error reading wallet from ${walletDir}:`, error);
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
    const searched = walletSearchPaths().join('\n  - ');
    throw new Error(
      '❌ No Polymarket wallet found!\n\n' +
        `Searched directories:\n  - ${searched}\n\n` +
        'Trade Manager requires a Polymarket wallet created via the Polymarket skill.\n\n' +
        'Please use the Polymarket skill to either:\n' +
        '  1. Create a new wallet: POST /api/secrets with type "POLYMARKET_WALLET"\n' +
        '  2. Re-link an existing wallet: POST /api/secrets/relink with your re-link token\n\n' +
        'The API key will be automatically saved to:\n' +
        '  ~/.openclaw/credentials/agentwallet/<api-key-id>.json\n\n' +
        'Tip: If the wallet is in a non-standard location, set OPENCLAW_HOME to the\n' +
        'directory containing the credentials/ folder.\n\n' +
        'Once you have a Polymarket wallet set up, Trade Manager will automatically detect it.'
    );
  }

  const defaultDbUrl = `file:${path.join(openclawHome(), 'trade-manager.db')}`;

  const parsed = configSchema.parse({
    ...fileConfig,
    port: process.env.PORT ? Number(process.env.PORT) : fileConfig.port,
    pollIntervalSeconds: process.env.POLL_INTERVAL_SECONDS
      ? Number(process.env.POLL_INTERVAL_SECONDS)
      : fileConfig.pollIntervalSeconds,
    vincentApiUrl: process.env.VINCENT_API_URL ?? fileConfig.vincentApiUrl,
    vincentApiKey: walletApiKey,
    databaseUrl: process.env.DATABASE_URL ?? fileConfig.databaseUrl ?? defaultDbUrl,
    enableWebSocket: process.env.ENABLE_WEBSOCKET === 'false' ? false : fileConfig.enableWebSocket,
    webSocketUrl: process.env.WEBSOCKET_URL ?? fileConfig.webSocketUrl,
    httpsEnabled: process.env.HTTPS_ENABLED === 'false' ? false : fileConfig.httpsEnabled,
    httpsPort: process.env.HTTPS_PORT ? Number(process.env.HTTPS_PORT) : fileConfig.httpsPort,
    caddyfilePath: process.env.CADDYFILE_PATH ?? fileConfig.caddyfilePath,
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
  httpsEnabled: true,
  httpsPort: 19443,
  caddyfilePath: '/etc/caddy/Caddyfile',
};
