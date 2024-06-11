import { IGalaSwapToken } from '../../src/dependencies/galaswap/types.js';

export const testTokens = [
  {
    collection: 'GALA',
    category: 'Unit',
    type: 'none',
    additionalKey: 'none',
    symbol: 'GALA',
    decimals: 8,
    currentPrices: {
      usd: 0.05,
    },
  },
  {
    collection: 'GUSDC',
    category: 'Unit',
    type: 'none',
    additionalKey: 'none',
    symbol: 'GUSDC',
    decimals: 6,
    currentPrices: {
      usd: 1,
    },
  },
  {
    collection: 'GUSDT',
    category: 'Unit',
    type: 'none',
    additionalKey: 'none',
    decimals: 6,
    symbol: 'GUSDT',
    currentPrices: {
      usd: 1,
    },
  },
] satisfies IGalaSwapToken[];
