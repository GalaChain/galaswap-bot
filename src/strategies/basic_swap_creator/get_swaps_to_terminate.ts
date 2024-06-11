import assert from 'assert';
import BigNumber from 'bignumber.js';
import { IGalaSwapToken, IRawSwap } from '../../dependencies/galaswap/types.js';
import { areSameTokenClass } from '../../types/type_helpers.js';
import { galaChainObjectIsExpired } from '../../utils/galachain_utils.js';
import {
  getActualSwapRateForSwapICreated,
  getCurrentMarketRate,
} from '../../utils/get_current_market_rate.js';
import { ISwapToTerminate } from '../swap_strategy.js';
import { ITargetActiveSwaps } from './types.js';

export function getSwapsToTerminate(
  ownSwaps: readonly Readonly<IRawSwap>[],
  tokenValues: readonly Readonly<IGalaSwapToken>[],
  targetActiveSwaps: readonly Readonly<ITargetActiveSwaps>[],
) {
  const swapsToTerminate: Readonly<ISwapToTerminate>[] = [];

  for (const swap of ownSwaps) {
    if (galaChainObjectIsExpired(swap)) {
      continue;
    }

    if (swap.uses === swap.usesSpent) {
      continue;
    }

    const swapOffered = swap.offered[0];
    const swapWanted = swap.wanted[0];

    const target = targetActiveSwaps.find(
      (target) =>
        areSameTokenClass(target.givingTokenClass, swapOffered.tokenInstance) &&
        areSameTokenClass(target.receivingTokenClass, swapWanted.tokenInstance) &&
        BigNumber(swap.uses).multipliedBy(swapOffered.quantity).isEqualTo(target.targetGivingSize),
    );

    if (!target) {
      swapsToTerminate.push({
        ...swap,
        terminationReason: `No active target found for this swap`,
      });

      continue;
    }

    const currentMarketRate = getCurrentMarketRate(
      swapOffered.tokenInstance,
      swapWanted.tokenInstance,
      tokenValues,
    );

    assert(currentMarketRate !== undefined, 'No current market rate found');

    const actualSwapRate = getActualSwapRateForSwapICreated(swap);
    const swapGoodnessRate = actualSwapRate / currentMarketRate;

    if (swapGoodnessRate < target.minProfitability) {
      swapsToTerminate.push({
        ...swap,
        terminationReason: 'Swap is no longer profitable enough due to changing market conditions.',
      });
    } else if (swapGoodnessRate > target.maxProfitability) {
      swapsToTerminate.push({
        ...swap,
        terminationReason: 'Swap is now too profitable due to changing market conditions.',
      });
    }
  }

  return swapsToTerminate;
}
