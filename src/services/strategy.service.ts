import {
  Strategy,
  AlertRule,
  StrategyType,
  StrategyStatus,
  RiskProfile,
  TriggerType,
  Prisma,
} from '@prisma/client';
import { z } from 'zod';
import prisma from '../db/client.js';
import { AppError } from '../api/middleware/errorHandler.js';
import { getTemplateById } from '../constants/strategy-templates.js';

// ============================================================
// Trigger Config Schemas (Zod)
// ============================================================

const priceThresholdConfigSchema = z.object({
  asset: z.string().min(1, 'Asset identifier is required'),
  direction: z.enum(['above', 'below']),
  price: z.number().min(0, 'Price must be non-negative'),
  chainId: z.number().int().optional(),
});

const cronScheduleConfigSchema = z.object({
  cron: z.string().min(9, 'Invalid cron expression').max(100),
  timezone: z.string().optional(),
});

const polymarketOddsConfigSchema = z.object({
  conditionId: z.string().min(1, 'Condition ID is required'),
  outcome: z.string().min(1, 'Outcome is required'),
  direction: z.enum(['above', 'below']),
  probability: z.number().min(0).max(1, 'Probability must be between 0 and 1'),
});

const triggerConfigSchemas: Record<TriggerType, z.ZodSchema> = {
  PRICE_THRESHOLD: priceThresholdConfigSchema,
  CRON_SCHEDULE: cronScheduleConfigSchema,
  POLYMARKET_ODDS: polymarketOddsConfigSchema,
};

// ============================================================
// Input Schemas
// ============================================================

const createStrategySchema = z.object({
  deploymentId: z.string().min(1),
  strategyType: z.nativeEnum(StrategyType),
  templateId: z.string().nullable().optional(),
  thesisText: z.string().min(1, 'Thesis text is required').max(5000),
  conditionTokenId: z.string().nullable().optional(),
  strategyConfig: z.record(z.string(), z.unknown()),
  riskProfile: z.nativeEnum(RiskProfile).optional().default('MODERATE'),
});

const updateStrategySchema = z.object({
  thesisText: z.string().min(1).max(5000).optional(),
  conditionTokenId: z.string().nullable().optional(),
  strategyConfig: z.record(z.string(), z.unknown()).optional(),
  riskProfile: z.nativeEnum(RiskProfile).optional(),
  status: z.nativeEnum(StrategyStatus).optional(),
});

// ============================================================
// Types
// ============================================================

export interface StrategyPublicData {
  id: string;
  deploymentId: string;
  strategyType: StrategyType;
  templateId: string | null;
  thesisText: string;
  conditionTokenId: string | null;
  strategyConfig: unknown;
  riskProfile: RiskProfile;
  status: StrategyStatus;
  createdAt: Date;
  updatedAt: Date;
  alertRules?: AlertRulePublicData[];
}

export interface AlertRulePublicData {
  id: string;
  strategyId: string;
  triggerType: TriggerType;
  triggerConfig: unknown;
  instruction: string;
  enabled: boolean;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStrategyInput {
  deploymentId: string;
  strategyType: StrategyType;
  templateId?: string | null;
  thesisText: string;
  conditionTokenId?: string | null;
  strategyConfig: Record<string, unknown>;
  riskProfile?: RiskProfile;
}

export interface UpdateStrategyInput {
  thesisText?: string;
  conditionTokenId?: string | null;
  strategyConfig?: Record<string, unknown>;
  riskProfile?: RiskProfile;
  status?: StrategyStatus;
}

export interface CreateAlertRuleInput {
  triggerType: TriggerType;
  triggerConfig: unknown;
  instruction: string;
  enabled?: boolean;
}

export interface UpdateAlertRuleInput {
  triggerConfig?: unknown;
  instruction?: string;
  enabled?: boolean;
}

// ============================================================
// Validation
// ============================================================

export function validateTriggerConfig(triggerType: TriggerType, config: unknown): unknown {
  const schema = triggerConfigSchemas[triggerType];
  if (!schema) {
    throw new AppError('INVALID_TRIGGER_TYPE', `Unknown trigger type: ${triggerType}`, 400);
  }
  return schema.parse(config);
}

export { createStrategySchema, updateStrategySchema };

// ============================================================
// Strategy CRUD
// ============================================================

export async function createStrategy(input: CreateStrategyInput): Promise<StrategyPublicData> {
  const validated = createStrategySchema.parse(input);

  const strategy = await prisma.strategy.create({
    data: {
      deploymentId: validated.deploymentId,
      strategyType: validated.strategyType,
      templateId: validated.templateId ?? null,
      thesisText: validated.thesisText,
      conditionTokenId: validated.conditionTokenId ?? null,
      strategyConfig: validated.strategyConfig as Prisma.InputJsonValue,
      riskProfile: validated.riskProfile,
    },
    include: { alertRules: true },
  });

  // Auto-create default alert rules from template if templateId is provided
  if (validated.templateId) {
    const template = getTemplateById(validated.templateId);
    if (template && template.defaultAlertRules.length > 0) {
      await prisma.alertRule.createMany({
        data: template.defaultAlertRules.map((rule) => ({
          strategyId: strategy.id,
          triggerType: rule.triggerType as TriggerType,
          triggerConfig: rule.triggerConfig as Prisma.InputJsonValue,
          instruction: rule.instruction,
          enabled: true,
        })),
      });

      // Re-fetch with alert rules
      const withRules = await prisma.strategy.findUniqueOrThrow({
        where: { id: strategy.id },
        include: { alertRules: true },
      });
      return toStrategyPublicData(withRules);
    }
  }

  return toStrategyPublicData(strategy);
}

export async function listStrategies(deploymentId: string): Promise<StrategyPublicData[]> {
  const strategies = await prisma.strategy.findMany({
    where: { deploymentId },
    include: { alertRules: true },
    orderBy: { createdAt: 'desc' },
  });

  return strategies.map(toStrategyPublicData);
}

export async function getStrategy(
  strategyId: string,
  deploymentId: string
): Promise<StrategyPublicData | null> {
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, deploymentId },
    include: { alertRules: true },
  });

  return strategy ? toStrategyPublicData(strategy) : null;
}

export async function updateStrategy(
  strategyId: string,
  deploymentId: string,
  input: UpdateStrategyInput
): Promise<StrategyPublicData> {
  const validated = updateStrategySchema.parse(input);

  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, deploymentId },
  });

  if (!strategy) {
    throw new AppError('NOT_FOUND', 'Strategy not found', 404);
  }

  const updated = await prisma.strategy.update({
    where: { id: strategyId },
    data: {
      ...(validated.thesisText !== undefined && { thesisText: validated.thesisText }),
      ...(validated.conditionTokenId !== undefined && {
        conditionTokenId: validated.conditionTokenId,
      }),
      ...(validated.strategyConfig !== undefined && {
        strategyConfig: validated.strategyConfig as Prisma.InputJsonValue,
      }),
      ...(validated.riskProfile !== undefined && { riskProfile: validated.riskProfile }),
      ...(validated.status !== undefined && { status: validated.status }),
    },
    include: { alertRules: true },
  });

  return toStrategyPublicData(updated);
}

export async function deleteStrategy(strategyId: string, deploymentId: string): Promise<void> {
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, deploymentId },
  });

  if (!strategy) {
    throw new AppError('NOT_FOUND', 'Strategy not found', 404);
  }

  await prisma.strategy.delete({ where: { id: strategyId } });
}

// ============================================================
// AlertRule CRUD
// ============================================================

export async function createAlertRule(
  strategyId: string,
  deploymentId: string,
  input: CreateAlertRuleInput
): Promise<AlertRulePublicData> {
  // Verify strategy ownership
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, deploymentId },
  });

  if (!strategy) {
    throw new AppError('NOT_FOUND', 'Strategy not found', 404);
  }

  // Validate trigger config
  const validatedConfig = validateTriggerConfig(input.triggerType, input.triggerConfig);

  const alertRule = await prisma.alertRule.create({
    data: {
      strategyId,
      triggerType: input.triggerType,
      triggerConfig: validatedConfig as Prisma.InputJsonValue,
      instruction: input.instruction,
      enabled: input.enabled ?? true,
    },
  });

  return toAlertRulePublicData(alertRule);
}

export async function listAlertRules(
  strategyId: string,
  deploymentId: string
): Promise<AlertRulePublicData[]> {
  // Verify strategy ownership
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, deploymentId },
  });

  if (!strategy) {
    throw new AppError('NOT_FOUND', 'Strategy not found', 404);
  }

  const rules = await prisma.alertRule.findMany({
    where: { strategyId },
    orderBy: { createdAt: 'asc' },
  });

  return rules.map(toAlertRulePublicData);
}

export async function updateAlertRule(
  alertRuleId: string,
  strategyId: string,
  deploymentId: string,
  input: UpdateAlertRuleInput
): Promise<AlertRulePublicData> {
  // Verify strategy ownership
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, deploymentId },
  });

  if (!strategy) {
    throw new AppError('NOT_FOUND', 'Strategy not found', 404);
  }

  const alertRule = await prisma.alertRule.findFirst({
    where: { id: alertRuleId, strategyId },
  });

  if (!alertRule) {
    throw new AppError('NOT_FOUND', 'Alert rule not found', 404);
  }

  // Validate trigger config if provided
  let validatedConfig: unknown;
  if (input.triggerConfig !== undefined) {
    validatedConfig = validateTriggerConfig(alertRule.triggerType, input.triggerConfig);
  }

  const updated = await prisma.alertRule.update({
    where: { id: alertRuleId },
    data: {
      ...(validatedConfig !== undefined && {
        triggerConfig: validatedConfig as Prisma.InputJsonValue,
      }),
      ...(input.instruction !== undefined && { instruction: input.instruction }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    },
  });

  return toAlertRulePublicData(updated);
}

export async function deleteAlertRule(
  alertRuleId: string,
  strategyId: string,
  deploymentId: string
): Promise<void> {
  // Verify strategy ownership
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, deploymentId },
  });

  if (!strategy) {
    throw new AppError('NOT_FOUND', 'Strategy not found', 404);
  }

  const alertRule = await prisma.alertRule.findFirst({
    where: { id: alertRuleId, strategyId },
  });

  if (!alertRule) {
    throw new AppError('NOT_FOUND', 'Alert rule not found', 404);
  }

  await prisma.alertRule.delete({ where: { id: alertRuleId } });
}

// ============================================================
// Query Helpers (for future alert evaluation engine)
// ============================================================

export async function getEnabledAlertRulesByType(
  triggerType: TriggerType
): Promise<(AlertRule & { strategy: Strategy })[]> {
  return prisma.alertRule.findMany({
    where: { triggerType, enabled: true, strategy: { status: 'ACTIVE' } },
    include: { strategy: true },
  });
}

export async function markAlertTriggered(alertRuleId: string): Promise<void> {
  await prisma.alertRule.update({
    where: { id: alertRuleId },
    data: { lastTriggeredAt: new Date() },
  });
}

// ============================================================
// Helpers
// ============================================================

function toStrategyPublicData(
  strategy: Strategy & { alertRules?: AlertRule[] }
): StrategyPublicData {
  return {
    id: strategy.id,
    deploymentId: strategy.deploymentId,
    strategyType: strategy.strategyType,
    templateId: strategy.templateId,
    thesisText: strategy.thesisText,
    conditionTokenId: strategy.conditionTokenId,
    strategyConfig: strategy.strategyConfig,
    riskProfile: strategy.riskProfile,
    status: strategy.status,
    createdAt: strategy.createdAt,
    updatedAt: strategy.updatedAt,
    ...(strategy.alertRules && {
      alertRules: strategy.alertRules.map(toAlertRulePublicData),
    }),
  };
}

function toAlertRulePublicData(alertRule: AlertRule): AlertRulePublicData {
  return {
    id: alertRule.id,
    strategyId: alertRule.strategyId,
    triggerType: alertRule.triggerType,
    triggerConfig: alertRule.triggerConfig,
    instruction: alertRule.instruction,
    enabled: alertRule.enabled,
    lastTriggeredAt: alertRule.lastTriggeredAt,
    createdAt: alertRule.createdAt,
    updatedAt: alertRule.updatedAt,
  };
}
