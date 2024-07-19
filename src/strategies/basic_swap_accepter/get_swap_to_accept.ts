import assert from 'assert';
import BigNumber from 'bignumber.js';
import { IGalaSwapToken, IRawSwap, ITokenBalance } from '../../dependencies/galaswap/types.js';
import { IStatusReporter } from '../../dependencies/status_reporters.js';
import { areSameTokenClass, stringifyTokenClass } from '../../types/type_helpers.js';
import { ITokenClassKey } from '../../types/types.js';
import { getUseableBalances } from '../../utils/galachain_utils.js';
import {
  getActualSwapRateForCandidateToAccept,
  getCurrentMarketRate,
  getSwapGoodnessRate,
} from '../../utils/get_current_market_rate.js';
import { ISwapToAccept } from '../swap_strategy.js';
import { IAccepterPairConfig, IMinimumBalanceConfig } from './types.js';

type GetPriceChangePercentDelegate = (
  tokenClass: ITokenClassKey,
  since: Date,
  until: Date,
) => Promise<number | undefined>;

function calculateUsesToAccept(swap: IRawSwap, maxGive: string) {
  const givingToken = swap.wanted[0];

  const numUsesThatWouldExhaustMaxGive = BigNumber(maxGive)
    .dividedBy(givingToken.quantity)
    .toString();

  const numUsesThatWouldExhaustSwap = BigNumber(swap.uses).minus(swap.usesSpent);

  return BigNumber.min(numUsesThatWouldExhaustMaxGive, numUsesThatWouldExhaustSwap).toFixed(
    0,
    BigNumber.ROUND_FLOOR,
  );
}

export async function getSwapsToAccept(
  reporter: IStatusReporter,
  ownWalletAddress: string,
  pairLimits: readonly Readonly<IAccepterPairConfig>[],
  ownBalances: readonly Readonly<ITokenBalance>[],
  tokenValues: readonly Readonly<IGalaSwapToken>[],
  minumumBalances: readonly Readonly<IMinimumBalanceConfig>[],
  getAvailableSwapsForPair: (
    givingTokenClass: Readonly<ITokenClassKey>,
    receivingTokenClass: Readonly<ITokenClassKey>,
  ) => Promise<readonly Readonly<IRawSwap>[]>,
  getQuantityGivenSince: (
    givingTokenClass: Readonly<ITokenClassKey>,
    receivingTokenClass: Readonly<ITokenClassKey>,
    since: Date,
    goodnessRatingUpTo: number,
  ) => Promise<number>,
  getPriceChangePercent: GetPriceChangePercentDelegate,
  options: {
    now?: Date | undefined;
  } = {},
): Promise<readonly Readonly<ISwapToAccept>[]> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();

  const useableBalancesPreFee = getUseableBalances(ownBalances);
  const useableGala = useableBalancesPreFee.find((b) => b.collection === 'GALA')?.quantity ?? '0';

  if (BigNumber(useableGala).lt(1)) {
    await reporter.sendAlert(
      'I have no $GALA! I need at least 1 $GALA in order to pay the fee when accepting a swap.',
    );

    return [];
  }

  const useableBalances = useableBalancesPreFee.map((b) => {
    const matchingMinimumBalance =
      minumumBalances.find((m) => areSameTokenClass(m, b))?.minimumBalance ?? 0;

    // Add one to the minimum GALA balance so we have enough to pay the 1 GALA fee
    const adjustedMinimumBalance =
      b.collection == 'GALA' ? matchingMinimumBalance + 1 : matchingMinimumBalance;

    return {
      ...b,
      quantity: BigNumber(b.quantity).minus(adjustedMinimumBalance),
    };
  });

  const pairLimitsWithCurrentState = await Promise.all(
    pairLimits.map(async (l) => {
      const amountGivenThisInterval = await getQuantityGivenSince(
        l.givingTokenClass,
        l.receivingTokenClass,
        new Date(nowMs - l.resetIntervalMs),
        l.rate,
      );

      const givingTokenPriceChangePercent =
        (await getPriceChangePercent(
          l.givingTokenClass,
          new Date(nowMs - l.maxPriceMovementWindowMs),
          now,
        )) ?? 0;

      const receivingTokenPriceChangePercent =
        (await getPriceChangePercent(
          l.receivingTokenClass,
          new Date(nowMs - l.maxPriceMovementWindowMs),
          now,
        )) ?? 0;

      const availableSwapsForThisPair = await getAvailableSwapsForPair(
        l.givingTokenClass,
        l.receivingTokenClass,
      );

      return {
        ...l,
        amountGivenThisInterval,
        givingTokenPriceChangePercent,
        receivingTokenPriceChangePercent,
        availableSwapsForThisPair,
      };
    }),
  );

  const acceptableSwaps: Array<ISwapToAccept> = [];

  for (const {
    givingTokenClass,
    receivingTokenClass,
    availableSwapsForThisPair,
    maxPriceMovementPercent,
    givingTokenPriceChangePercent,
    receivingTokenPriceChangePercent,
    rate,
    giveLimitPerReset,
    amountGivenThisInterval,
    maxReceivingTokenPriceUSD,
    minReceivingTokenAmount,
  } of pairLimitsWithCurrentState) {
    if (givingTokenPriceChangePercent > maxPriceMovementPercent) {
      continue;
    }

    if (receivingTokenPriceChangePercent > maxPriceMovementPercent) {
      continue;
    }

    const currentMarketRate = getCurrentMarketRate(
      givingTokenClass,
      receivingTokenClass,
      tokenValues,
    );

    if (!currentMarketRate) {
      continue;
    }

    const receivingTokenValue = tokenValues.find((t) => areSameTokenClass(t, receivingTokenClass));
    assert(
      receivingTokenValue,
      `Token value not found for ${stringifyTokenClass(receivingTokenClass)}`,
    );

    if (
      typeof maxReceivingTokenPriceUSD === 'number' &&
      (!receivingTokenValue.currentPrices.usd ||
        receivingTokenValue.currentPrices.usd > maxReceivingTokenPriceUSD)
    ) {
      continue;
    }

    for (const swap of availableSwapsForThisPair) {
      if (swap.offeredBy.endsWith(ownWalletAddress)) {
        continue;
      }

      if (swap.offered[0].quantity === '0' || swap.wanted[0].quantity === '0') {
        continue;
      }

      const actualSwapRate = getActualSwapRateForCandidateToAccept(swap);
      const goodnessRating = getSwapGoodnessRate(actualSwapRate, currentMarketRate);

      if (goodnessRating < rate) {
        continue;
      }

      const balance =
        useableBalances.find((balance) => areSameTokenClass(balance, givingTokenClass))?.quantity ??
        '0';

      const amountRemainingInLimit = BigNumber(giveLimitPerReset).minus(amountGivenThisInterval);
      const canGiveUpTo = BigNumber.max(
        BigNumber.min(balance, amountRemainingInLimit),
        '0',
      ).toString();

      const usesToAccept = calculateUsesToAccept(swap, canGiveUpTo);
      const amountToReceive = BigNumber(usesToAccept).times(swap.offered[0].quantity);

      if (
        typeof minReceivingTokenAmount === 'number' &&
        amountToReceive.lt(minReceivingTokenAmount)
      ) {
        continue;
      }

      if (usesToAccept === '0') {
        continue;
      }

      acceptableSwaps.push({
        ...swap,
        goodnessRating,
        usesToAccept,
      });
    }
  }

  acceptableSwaps.sort((a, b) => {
    const goodnessDiff = b.goodnessRating - a.goodnessRating;
    if (goodnessDiff !== 0) {
      return goodnessDiff;
    }

    return b.swapRequestId.localeCompare(a.swapRequestId);
  });

  // Only accept one per tick
  return acceptableSwaps.slice(0, 1);
}
