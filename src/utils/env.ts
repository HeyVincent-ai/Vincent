import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10)),

  // Database
  DATABASE_URL: z.string().url(),

  // Stytch Authentication
  STYTCH_PROJECT_ID: z.string().min(1),
  STYTCH_SECRET: z.string().min(1),
  STYTCH_ENV: z.enum(['test', 'live']).default('test'),

  // ZeroDev Configuration (optional in development)
  ZERODEV_PROJECT_ID: z.string().optional(),
  ZERODEV_API_KEY: z.string().optional(),

  // Stripe Billing (optional in development)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),

  // Telegram Bot (optional in development)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),

  // API Security
  CLAIM_TOKEN_EXPIRY_DAYS: z
    .string()
    .default('7')
    .transform((val) => parseInt(val, 10)),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((val) => parseInt(val, 10)),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .default('100')
    .transform((val) => parseInt(val, 10)),

  // Frontend URL (for CORS in production)
  FRONTEND_URL: z.string().optional(),

  // Price Oracle
  COINGECKO_API_KEY: z.string().optional(),

  // Alchemy
  ALCHEMY_API_KEY: z.string().optional(),

  // Block Explorer APIs (Etherscan and compatible explorers)
  ETHERSCAN_API_KEY: z.string().optional(),

  // 0x Swap API
  ZEROX_API_KEY: z.string().optional(),
  SWAP_FEE_BPS: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0)),
  SWAP_FEE_RECIPIENT: z.string().optional(),

  // Polymarket
  POLYMARKET_CLOB_HOST: z.string().optional().default('https://clob.polymarket.com'),

  // Polymarket Builder / Relayer
  POLY_BUILDER_API_KEY: z.string().optional(),
  POLY_BUILDER_SECRET: z.string().optional(),
  POLY_BUILDER_PASSPHRASE: z.string().optional(),
  POLYMARKET_RELAYER_HOST: z.string().optional().default('https://relayer-v2.polymarket.com/'),

  // Webshare Proxy (for geo-restricted API calls like Polymarket)
  WEBSHARE_API_KEY: z.string().optional(),

  // OVH API (for OpenClaw VPS provisioning)
  OVH_APP_KEY: z.string().optional(),
  OVH_APP_SECRET: z.string().optional(),
  OVH_CONSUMER_KEY: z.string().optional(),
  OVH_ENDPOINT: z.string().optional().default('ovh-us'),

  // OpenRouter Provisioning Key (for per-deployment API key management)
  OPENROUTER_PROVISIONING_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();
