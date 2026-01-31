import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10)),

  // Database
  DATABASE_URL: z.string().url(),

  // Stytch Authentication (optional in development)
  STYTCH_PROJECT_ID: z.string().optional(),
  STYTCH_SECRET: z.string().optional(),
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

  // API Security
  API_KEY_SALT_ROUNDS: z
    .string()
    .default('12')
    .transform((val) => parseInt(val, 10)),
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

  // Price Oracle
  COINGECKO_API_KEY: z.string().optional(),
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
