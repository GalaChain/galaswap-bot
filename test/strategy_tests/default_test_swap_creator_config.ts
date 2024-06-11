import { ISwapCreatorConfig } from '../../src/strategies/basic_swap_creator/types.js';

export const defaultTestSwapCreatorConfig: ISwapCreatorConfig = {
  active: true,
  creationLimits: [
    {
      givingTokenClass: {
        collection: 'GUSDC',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      receivingTokenClass: {
        collection: 'GALA',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      resetIntervalMs: 43200000,
      giveLimitPerReset: 30000,
    },
    {
      givingTokenClass: {
        collection: 'GALA',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      receivingTokenClass: {
        collection: 'GUSDC',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      resetIntervalMs: 43200000,
      giveLimitPerReset: 150000,
    },
  ],
  targetActiveSwaps: [
    {
      givingTokenClass: {
        collection: 'GUSDC',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      receivingTokenClass: {
        collection: 'GALA',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      targetProfitability: 1.05,
      minProfitability: 1.01,
      maxProfitability: 1.15,
      targetGivingSize: 10000,
      maxPriceMovementPercent: 100,
      maxPriceMovementWindowMs: 1,
    },
    {
      givingTokenClass: {
        collection: 'GALA',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      receivingTokenClass: {
        collection: 'GUSDC',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      targetProfitability: 1.05,
      minProfitability: 1.01,
      maxProfitability: 1.15,
      targetGivingSize: 50000,
      maxPriceMovementPercent: 100,
      maxPriceMovementWindowMs: 1,
    },
  ],
  receivingTokenRoundingConfigs: [
    {
      collection: 'GALA',
      category: 'Unit',
      type: 'none',
      additionalKey: 'none',
      decimalPlaces: 0,
    },
    {
      collection: 'GUSDC',
      category: 'Unit',
      type: 'none',
      additionalKey: 'none',
      decimalPlaces: 2,
    },
  ],
};
