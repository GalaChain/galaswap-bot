import { z } from 'zod';
import { areSameTokenClass, stringifyTokenClass } from '../../types/type_helpers.js';
import { tokenClassKeySchema } from '../../types/types.js';

const creationLimitsSchema = z.object({
  givingTokenClass: tokenClassKeySchema,
  receivingTokenClass: tokenClassKeySchema,
  resetIntervalMs: z.number().int().positive(),
  giveLimitPerReset: z.number().int().positive(),
});

export type IMaxNewQuantityCreatedLimit = z.infer<typeof creationLimitsSchema>;

const targetActiveSwapsSchema = z
  .object({
    givingTokenClass: tokenClassKeySchema,
    receivingTokenClass: tokenClassKeySchema,
    targetProfitability: z.number().positive(),
    minProfitability: z.number().positive(),
    maxProfitability: z.number().positive(),
    targetGivingSize: z.number().int().positive(),
    maxPriceMovementPercent: z.number().positive(),
    maxPriceMovementWindowMs: z.number().positive(),
    maxReceivingTokenPriceUSD: z.number().positive().optional(),
    givingTokenClassMinimumValue: z.number().positive().optional(),
  })
  .refine((data) => data.minProfitability < data.maxProfitability, {
    message: 'minProfitability must be less than maxProfitability',
    path: ['minProfitability', 'maxProfitability'],
  })
  .refine((data) => data.targetProfitability > data.minProfitability, {
    message: 'targetProfitability must be greater than minProfitability',
    path: ['targetProfitability', 'minProfitability'],
  })
  .refine((data) => data.targetProfitability < data.maxProfitability, {
    message: 'targetProfitability must be less than maxProfitability',
    path: ['targetProfitability', 'maxProfitability'],
  });

export type ITargetActiveSwaps = z.infer<typeof targetActiveSwapsSchema>;

const receivingTokenRoundingConfigSchema = z.object({
  collection: z.string(),
  category: z.string(),
  type: z.string(),
  additionalKey: z.string(),
  decimalPlaces: z.number().int().nonnegative(),
});

export type IReceivingTokenRoundingConfig = z.infer<typeof receivingTokenRoundingConfigSchema>;

export const basicSwapCreatorConfigSchema = z
  .object({
    active: z.boolean(),
    creationLimits: z.array(creationLimitsSchema),
    targetActiveSwaps: z.array(targetActiveSwapsSchema),
    receivingTokenRoundingConfigs: z.array(receivingTokenRoundingConfigSchema),
  })
  .refine(
    (data) => {
      for (const target of data.targetActiveSwaps) {
        const newQuantityCreatedLimits = data.creationLimits.filter(
          (limit) =>
            areSameTokenClass(limit.givingTokenClass, target.givingTokenClass) &&
            areSameTokenClass(limit.receivingTokenClass, target.receivingTokenClass),
        );

        if (newQuantityCreatedLimits.length === 0) {
          return false;
        }
      }

      return true;
    },
    {
      message:
        'At least one targetActiveSwaps does not have a matching creationLimit. Every targetActiveSwaps must have a matching creationLimit.',
      path: ['targetActiveSwaps'],
    },
  )
  .refine(
    (data) => {
      for (const target of data.targetActiveSwaps) {
        const roundingConfigForReceivingToken = data.receivingTokenRoundingConfigs.find((config) =>
          areSameTokenClass(config, target.receivingTokenClass),
        );

        if (!roundingConfigForReceivingToken) {
          return false;
        }
      }

      return true;
    },
    {
      message:
        'At least one targetActiveSwaps does not have a matching receivingTokenRoundingConfig. Every targetActiveSwaps must have a matching receivingTokenRoundingConfig.',
      path: ['targetActiveSwaps'],
    },
  )
  .refine(
    (data) => {
      const configsForPairKey = new Map<string, ITargetActiveSwaps[]>();

      for (const target of data.targetActiveSwaps) {
        const key = `${stringifyTokenClass(target.givingTokenClass)}-${stringifyTokenClass(target.receivingTokenClass)}`;
        const configs = configsForPairKey.get(key) ?? [];
        configsForPairKey.set(key, configs);
        configs.push(target);
      }

      for (const [_, configs] of configsForPairKey.entries()) {
        const targetGivingSizes = new Set(configs.map((config) => config.targetGivingSize));
        if (targetGivingSizes.size !== configs.length) {
          return false;
        }
      }

      return true;
    },
    {
      message:
        'For each trading pair, there must only be one targetActiveSwaps for a given targetGivingSize.',
      path: ['targetActiveSwaps'],
    },
  );

export type ISwapCreatorConfig = z.infer<typeof basicSwapCreatorConfigSchema>;
