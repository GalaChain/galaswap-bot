import assert from 'assert';
import BigNumber from 'bignumber.js';
import { IGalaSwapToken, IRawSwap, ITokenBalance } from '../../dependencies/galaswap/types.js';
import { IStatusReporter } from '../../dependencies/status_reporters.js';
import { areSameTokenClass, stringifyTokenClass } from '../../types/type_helpers.js';
import { ILogger, ITokenClassKey } from '../../types/types.js';
import { galaChainObjectIsExpired, getUseableBalances } from '../../utils/galachain_utils.js';
import { getCurrentMarketRate } from '../../utils/get_current_market_rate.js';
import { calculateSwapQuantitiesAndUses } from '../../utils/swap_uses.js';
import { ISwapCreatorConfig } from './types.js';

export async function getSwapsToCreate(
  reporter: IStatusReporter,
  logger: ILogger,
  ownBalances: readonly Readonly<ITokenBalance>[],
  allSwaps: readonly Readonly<IRawSwap>[],
  tokenValues: readonly Readonly<IGalaSwapToken>[],
  config: ISwapCreatorConfig,
  getTotalOfferedQuantitySpentOnSwapsCreatedSince: (
    givingTokenClass: Readonly<ITokenClassKey>,
    receivingTokenClass: Readonly<ITokenClassKey>,
    since: Date,
  ) => Promise<number>,
  getPriceChangePercent: (
    tokenClass: ITokenClassKey,
    since: Date,
    until: Date,
  ) => Promise<number | undefined>,
  options?: {
    now?: Date;
  },
) {
  const nowMs = options?.now?.getTime() ?? Date.now();

  const useableBalancesPreFee = getUseableBalances(ownBalances);
  const useableGala = useableBalancesPreFee.find((b) => b.collection === 'GALA')?.quantity ?? '0';

  if (BigNumber(useableGala).lt(1)) {
    await reporter.sendAlert(
      'I have no $GALA! I need at least 1 $GALA in order to pay the fee when accepting a swap.',
    );

    return [];
  }

  const useableBalances = useableBalancesPreFee.map((b) => ({
    ...b,
    quantity: b.collection === 'GALA' ? BigNumber(b.quantity).minus(1).toString() : b.quantity,
  }));

  for (const target of config.targetActiveSwaps) {
    const givingBalanceForThisTarget =
      useableBalances.find((balance) => areSameTokenClass(balance, target.givingTokenClass))
        ?.quantity ?? '0';

    const activeSwapsForThisTarget = allSwaps
      .filter((swap) => !galaChainObjectIsExpired(swap))
      .filter((swap) => swap.uses !== swap.usesSpent)
      .filter(
        (swap) =>
          areSameTokenClass(swap.offered[0].tokenInstance, target.givingTokenClass) &&
          areSameTokenClass(swap.wanted[0].tokenInstance, target.receivingTokenClass) &&
          BigNumber(swap.uses)
            .multipliedBy(swap.offered[0].quantity)
            .isEqualTo(target.targetGivingSize),
      )
      .filter((swap) =>
        BigNumber(swap.offered[0].quantity).multipliedBy(swap.uses).eq(target.targetGivingSize),
      );

    const receivingTokenValue = tokenValues.find((t) =>
      areSameTokenClass(t, target.receivingTokenClass),
    );
    assert(
      receivingTokenValue,
      `Token value not found for ${stringifyTokenClass(target.receivingTokenClass)}`,
    );

    if (
      typeof target.maxReceivingTokenPriceUSD === 'number' &&
      (!receivingTokenValue.currentPrices.usd ||
        receivingTokenValue.currentPrices.usd > target.maxReceivingTokenPriceUSD)
    ) {
      continue;
    }

    if (activeSwapsForThisTarget.length > 0) {
      continue;
    }

    if (Number(givingBalanceForThisTarget) < target.targetGivingSize) {
      logger.info({
        message: 'Ignoring target, insufficient balance to create',
        target,
      });

      continue;
    }

    const matchingAggregateQuantityLimits = config.creationLimits.filter(
      (limit) =>
        areSameTokenClass(limit.givingTokenClass, target.givingTokenClass) &&
        areSameTokenClass(limit.receivingTokenClass, target.receivingTokenClass),
    );

    assert(
      matchingAggregateQuantityLimits.length > 0,
      `No matching aggregate quantity limits found for pair ${target.givingTokenClass}/${target.receivingTokenClass}`,
    );

    let amountAllowedUnderLimits = BigNumber(Number.MAX_SAFE_INTEGER);

    for (const limit of matchingAggregateQuantityLimits) {
      const quantitySpent = await getTotalOfferedQuantitySpentOnSwapsCreatedSince(
        target.givingTokenClass,
        target.receivingTokenClass,
        new Date(nowMs - limit.resetIntervalMs),
      );

      amountAllowedUnderLimits = BigNumber.min(
        amountAllowedUnderLimits,
        BigNumber(limit.giveLimitPerReset).minus(quantitySpent),
      );
    }

    if (amountAllowedUnderLimits.isLessThan(target.targetGivingSize)) {
      continue;
    }

    const [givingTokenPriceChangePercent, receivingTokenPriceChangePercent] = await Promise.all([
      getPriceChangePercent(
        target.givingTokenClass,
        new Date(nowMs - target.maxPriceMovementWindowMs),
        new Date(nowMs),
      ),
      getPriceChangePercent(
        target.receivingTokenClass,
        new Date(nowMs - target.maxPriceMovementWindowMs),
        new Date(nowMs),
      ),
    ]);

    if (
      Number(givingTokenPriceChangePercent) > target.maxPriceMovementPercent ||
      Number(receivingTokenPriceChangePercent) > target.maxPriceMovementPercent
    ) {
      continue;
    }

    const amountToGive = BigNumber(target.targetGivingSize);
    const minimumTokenValues =
      typeof target.givingTokenClassMinimumValue === 'number'
        ? [
            {
              ...target.givingTokenClass,
              currentPrices: {
                usd: target.givingTokenClassMinimumValue,
              },
            },
          ]
        : [];

    const currentMarketRate = getCurrentMarketRate(
      target.givingTokenClass,
      target.receivingTokenClass,
      tokenValues,
      minimumTokenValues,
    );

    assert(currentMarketRate !== undefined, 'No current market rate found');

    const receivingTokenRoundingConfig = config.receivingTokenRoundingConfigs.find((config) =>
      areSameTokenClass(config, target.receivingTokenClass),
    );

    assert(receivingTokenRoundingConfig !== undefined, 'No rounding config found');

    const totalQuantityToReceive = amountToGive
      .multipliedBy(currentMarketRate)
      .multipliedBy(target.targetProfitability)
      .toFixed(receivingTokenRoundingConfig.decimalPlaces, BigNumber.ROUND_CEIL);

    const decimalsForGivingToken = tokenValues.find((token) =>
      areSameTokenClass(token, target.givingTokenClass),
    )?.decimals;

    assert(decimalsForGivingToken !== undefined, 'No decimals found for giving token');

    const decimalsForReceivingToken = tokenValues.find((token) =>
      areSameTokenClass(token, target.receivingTokenClass),
    )?.decimals;

    assert(decimalsForReceivingToken !== undefined, 'No decimals found for receiving token');

    const newSwapConfig = calculateSwapQuantitiesAndUses(
      decimalsForGivingToken,
      decimalsForReceivingToken,
      amountToGive,
      BigNumber(totalQuantityToReceive),
    );

    const newSwap = {
      uses: newSwapConfig.uses,
      offered: [
        {
          quantity: newSwapConfig.givingQuantity,
          tokenInstance: {
            ...target.givingTokenClass,
            instance: '0',
          },
        },
      ],
      wanted: [
        {
          quantity: newSwapConfig.receivingQuantity,
          tokenInstance: {
            ...target.receivingTokenClass,
            instance: '0',
          },
        },
      ],
    } satisfies Pick<IRawSwap, 'offered' | 'wanted' | 'uses'>;

    return [newSwap];
  }

  return [];
}
