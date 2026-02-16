import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  port: z.number().int().positive().default(19000),
  pollIntervalSeconds: z.number().int().positive().default(15),
  vincentApiUrl: z.string().url(),
  vincentApiKey: z.string().min(1),
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
  const keyPath = path.join(os.homedir(), '.openclaw', 'credentials', 'agentwallet', 'api-key');
  if (!fs.existsSync(keyPath)) {
    return undefined;
  }
  return fs.readFileSync(keyPath, 'utf8').trim();
};

export const loadConfig = (): TradeManagerConfig => {
  const fileConfig = readJsonConfig();
  const parsed = configSchema.parse({
    ...fileConfig,
    port: process.env.PORT ? Number(process.env.PORT) : fileConfig.port,
    pollIntervalSeconds: process.env.POLL_INTERVAL_SECONDS
      ? Number(process.env.POLL_INTERVAL_SECONDS)
      : fileConfig.pollIntervalSeconds,
    vincentApiUrl: process.env.VINCENT_API_URL ?? fileConfig.vincentApiUrl,
    vincentApiKey: process.env.VINCENT_API_KEY ?? readWalletApiKey() ?? fileConfig.vincentApiKey,
    databaseUrl: process.env.DATABASE_URL ?? fileConfig.databaseUrl,
  });

  process.env.DATABASE_URL = parsed.databaseUrl;
  return parsed;
};

export const defaultConfigTemplate = {
  port: 19000,
  pollIntervalSeconds: 15,
  vincentApiUrl: 'http://localhost:3000',
  vincentApiKey: 'replace-me',
  databaseUrl: 'file:~/.openclaw/trade-manager.db',
};
