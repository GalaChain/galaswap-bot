import crypto from 'crypto';
import { IGalaSwapToken, IRawSwap, ITokenBalance } from '../src/dependencies/galaswap/types.js';
import {
  IAccepterPairConfig,
  IMinimumBalanceConfig,
} from '../src/strategies/basic_swap_accepter/types.js';
import { ITargetActiveSwaps } from '../src/strategies/basic_swap_creator/types.js';

export function makeTokenClass(collection: string) {
  return {
    collection,
    category: 'Unit',
    type: 'none',
    additionalKey: 'none',
  };
}

export function makeTokenInstance(collection: string) {
  return {
    ...makeTokenClass(collection),
    instance: '0' as const,
  };
}

export function makePairLimit(options: Partial<IAccepterPairConfig> = {}): IAccepterPairConfig {
  return {
    givingTokenClass: makeTokenClass('GUSDC'),
    receivingTokenClass: makeTokenClass('GALA'),
    rate: 1,
    resetIntervalMs: 1000 * 60 * 60, // 1 hour
    giveLimitPerReset: 1000,
    maxPriceMovementPercent: 100,
    maxPriceMovementWindowMs: 1,
    ...options,
  };
}

export function makeAvailableSwap(
  options: {
    id?: string;
    offeredCollection?: string;
    offeredQuantity?: string;
    wantedCollection?: string;
    wantedQuantity?: string;
    uses?: string;
    usesSpent?: string;
    offeredBy?: string;
  } = {},
): IRawSwap {
  return {
    offered: [
      {
        tokenInstance: makeTokenInstance(options.offeredCollection ?? 'GALA'),
        quantity: options.offeredQuantity ?? '2000',
      },
    ],
    wanted: [
      {
        tokenInstance: makeTokenInstance(options.wantedCollection ?? 'GUSDC'),
        quantity: options.wantedQuantity ?? '100',
      },
    ],
    swapRequestId: options.id ?? crypto.randomUUID(),
    uses: options?.uses ?? '1',
    usesSpent: options?.usesSpent ?? '0',
    created: Date.now(),
    expires: Date.now() + 1000 * 60 * 60,
    offeredBy: options.offeredBy ?? 'client|someone_else',
  };
}

export function makeBalance(
  options: {
    collection?: string;
    quantity?: string;
    lockedHolds?: ITokenBalance['lockedHolds'];
  } = {},
): ITokenBalance {
  return {
    ...makeTokenClass(options.collection ?? 'GUSDC'),
    quantity: options.quantity ?? '0',
    lockedHolds: options.lockedHolds ?? [],
  };
}

export function makeTokenValue(
  options: { collection?: string | undefined; usd?: number } = {},
): IGalaSwapToken {
  return {
    ...makeTokenClass(options.collection ?? 'GUSDC'),
    symbol: options.collection ?? 'GUSDC',
    decimals: 8,
    currentPrices: {
      usd: options.usd ?? 1,
    },
  };
}

export function makeTargetActiveSwap(options: Partial<ITargetActiveSwaps>): ITargetActiveSwaps {
  return {
    givingTokenClass: makeTokenClass('GUSDC'),
    receivingTokenClass: makeTokenClass('GALA'),
    targetGivingSize: 10,
    targetProfitability: 1.1,
    minProfitability: 1,
    maxProfitability: 1.25,
    maxPriceMovementPercent: 100,
    maxPriceMovementWindowMs: 1,
    ...options,
  };
}

export function makeMinimumBalance(
  options: { collection?: string | undefined; balance?: number } = {},
): IMinimumBalanceConfig {
  return {
    ...makeTokenClass(options.collection ?? 'GUSDC'),
    minimumBalance: options.balance ?? 0,
  };
}

export function createTestSwap(
  swapToCreate: Pick<IRawSwap, 'offered' | 'wanted' | 'uses'>,
): IRawSwap {
  return {
    ...swapToCreate,
    swapRequestId: crypto.randomUUID(),
    created: Date.now(),
    expires: 0,
    usesSpent: '0',
    offeredBy: 'client',
  };
}
