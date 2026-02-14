import { TradingPolicy, TradingVenue, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';

export interface TradingPolicyInput {
  venue: 'alpaca';
  enabled?: boolean;
  allowedSymbols?: string[];
  allowedOrderTypes?: string[];
  longOnly?: boolean;
  restrictToRth?: boolean;
  timezone?: string;
  maxOrderNotionalUsd?: number | null;
  maxPositionNotionalUsdPerSymbol?: number | null;
  maxDailyNotionalUsd?: number | null;
}

export interface TradingPolicyPublic {
  id: string;
  venue: TradingVenue;
  enabled: boolean;
  allowedSymbols: string[];
  allowedOrderTypes: string[];
  longOnly: boolean;
  restrictToRth: boolean;
  timezone: string;
  maxOrderNotionalUsd: number | null;
  maxPositionNotionalUsdPerSymbol: number | null;
  maxDailyNotionalUsd: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const policySchema = z.object({
  venue: z.literal('alpaca').default('alpaca'),
  enabled: z.boolean().optional(),
  allowedSymbols: z.array(z.string().min(1)).optional(),
  allowedOrderTypes: z.array(z.enum(['market', 'limit'])).optional(),
  longOnly: z.boolean().optional(),
  restrictToRth: z.boolean().optional(),
  timezone: z.string().optional(),
  maxOrderNotionalUsd: z.number().positive().nullable().optional(),
  maxPositionNotionalUsdPerSymbol: z.number().positive().nullable().optional(),
  maxDailyNotionalUsd: z.number().positive().nullable().optional(),
});

function normalizeSymbols(list: string[] | undefined): string[] {
  if (!list) return [];
  return Array.from(new Set(list.map((s) => s.trim().toUpperCase()).filter(Boolean)));
}

function normalizeOrderTypes(list: string[] | undefined): string[] {
  if (!list) return [];
  return Array.from(new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean)));
}

function jsonArrayToStrings(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function toPublicData(policy: TradingPolicy): TradingPolicyPublic {
  return {
    id: policy.id,
    venue: policy.venue,
    enabled: policy.enabled,
    allowedSymbols: jsonArrayToStrings(policy.allowedSymbols),
    allowedOrderTypes: jsonArrayToStrings(policy.allowedOrderTypes),
    longOnly: policy.longOnly,
    restrictToRth: policy.restrictToRth,
    timezone: policy.timezone,
    maxOrderNotionalUsd: policy.maxOrderNotionalUsd ?? null,
    maxPositionNotionalUsdPerSymbol: policy.maxPositionNotionalUsdPerSymbol ?? null,
    maxDailyNotionalUsd: policy.maxDailyNotionalUsd ?? null,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

export async function getPolicy(userId: string, venue: TradingVenue) {
  const policy = await prisma.tradingPolicy.findFirst({
    where: { userId, venue },
  });
  return policy ? toPublicData(policy) : null;
}

export async function upsertPolicy(userId: string, input: TradingPolicyInput) {
  const parsed = policySchema.parse(input);
  const allowedSymbols = normalizeSymbols(parsed.allowedSymbols);
  const allowedOrderTypes = normalizeOrderTypes(parsed.allowedOrderTypes);
  const enabled = parsed.enabled ?? false;
  const timezone = parsed.timezone ?? 'America/New_York';

  // No required fields. Policies are optional and can be empty.

  const data = {
    venue: TradingVenue.ALPACA,
    enabled,
    allowedSymbols: allowedSymbols as unknown as Prisma.InputJsonValue,
    allowedOrderTypes: allowedOrderTypes as unknown as Prisma.InputJsonValue,
    longOnly: parsed.longOnly ?? false,
    restrictToRth: parsed.restrictToRth ?? false,
    timezone,
    maxOrderNotionalUsd: parsed.maxOrderNotionalUsd ?? null,
    maxPositionNotionalUsdPerSymbol: parsed.maxPositionNotionalUsdPerSymbol ?? null,
    maxDailyNotionalUsd: parsed.maxDailyNotionalUsd ?? null,
  };

  const policy = await prisma.tradingPolicy.upsert({
    where: {
      userId_venue: {
        userId,
        venue: TradingVenue.ALPACA,
      },
    },
    create: {
      userId,
      ...data,
    },
    update: data,
  });

  return toPublicData(policy);
}
