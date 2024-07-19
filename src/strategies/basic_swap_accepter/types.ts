import { z } from 'zod';
import { stringifyTokenClass } from '../../types/type_helpers.js';
import { tokenClassKeySchema } from '../../types/types.js';

export const accepterPairConfigSchema = z.object({
  givingTokenClass: tokenClassKeySchema,
  receivingTokenClass: tokenClassKeySchema,
  rate: z.number().positive(),
  resetIntervalMs: z.number().positive(),
  giveLimitPerReset: z.number().positive(),
  maxPriceMovementPercent: z.number().positive(),
  maxPriceMovementWindowMs: z.number().positive(),
  maxReceivingTokenPriceUSD: z.number().positive().optional(),
  minReceivingTokenAmount: z.number().positive().optional(),
});

export type IAccepterPairConfig = z.infer<typeof accepterPairConfigSchema>;

export const minimumBalanceConfigSchema = z.object({
  collection: z.string(),
  category: z.string(),
  type: z.string(),
  additionalKey: z.string(),
  minimumBalance: z.number().nonnegative(),
});

export type IMinimumBalanceConfig = z.infer<typeof minimumBalanceConfigSchema>;

export const basicSwapAccepterConfigSchema = z.object({
  active: z.boolean(),
  tradeLimits: z.array(accepterPairConfigSchema).refine(
    (limits) => {
      const pairs = new Set<string>();
      for (const l of limits) {
        const pairStr = `${stringifyTokenClass(l.givingTokenClass)}-${stringifyTokenClass(l.receivingTokenClass)}`;
        if (pairs.has(pairStr)) {
          return false;
        }

        pairs.add(pairStr);
      }

      return true;
    },
    { message: 'Trade limits must be unique per pair' },
  ),
  minimumBalances: z.array(minimumBalanceConfigSchema),
});
