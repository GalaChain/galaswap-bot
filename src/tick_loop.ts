import BigNumber from 'bignumber.js';
import util from 'util';
import { MongoAcceptedSwapStore } from './dependencies/accepted_swap_store.js';
import { MongoCreatedSwapStore } from './dependencies/created_swap_store.js';
import { IGalaSwapApi } from './dependencies/galaswap/types.js';
import { MongoPriceStore } from './dependencies/price_store.js';
import { IStatusReporter } from './dependencies/status_reporters.js';
import { ISwapStrategy, ISwapToAccept } from './strategies/swap_strategy.js';
import { ITokenConfig, defaultTokenConfig } from './token_config.js';
import { stringifyTokenClass } from './types/type_helpers.js';
import { ILogger } from './types/types.js';
import { checkMarketPriceWithinRanges } from './utils/check_market_prices_in_range.js';

const sleep = util.promisify(setTimeout);

async function handleSwapAcceptResult(
  acceptedSwapStore: MongoAcceptedSwapStore,
  reporter: IStatusReporter,
  swapToAccept: Readonly<ISwapToAccept>,
  swapAcceptResult: Awaited<ReturnType<IGalaSwapApi['acceptSwap']>>,
) {
  if (swapAcceptResult.status === 'accepted') {
    await acceptedSwapStore.addAcceptedSwap(
      swapToAccept,
      stringifyTokenClass(swapToAccept.wanted[0].tokenInstance),
      stringifyTokenClass(swapToAccept.offered[0].tokenInstance),
      BigNumber(swapToAccept.wanted[0].quantity).multipliedBy(swapToAccept.usesToAccept).toNumber(),
      BigNumber(swapToAccept.offered[0].quantity)
        .multipliedBy(swapToAccept.usesToAccept)
        .toNumber(),
      swapToAccept.goodnessRating,
    );
  } else if (swapAcceptResult.status === 'already_accepted') {
    await reporter.sendAlert(
      `I wasn't fast enough and someone else accepted swap ${swapToAccept.swapRequestId} before I could.`,
    );
  }
}

export async function mainLoopTick(
  ownWalletAddress: string,
  logger: ILogger,
  galaSwapApi: IGalaSwapApi,
  reporter: IStatusReporter,
  createdSwapStore: MongoCreatedSwapStore,
  acceptedSwapStore: MongoAcceptedSwapStore,
  priceStore: MongoPriceStore,
  strategies: ISwapStrategy[],
  executionDelay: number,
  options: {
    ignoreSwapsCreatedBefore?: Date;
    now?: Date;
    tokenConfig?: ITokenConfig;
  } = {},
) {
  try {
    // Get all swaps for oneself. This may return swaps that have already been fully used
    // or expired, so the options.ignoreSwapsCreatedBefore option is an optimization to
    // let us ignore those. If we know that we do not have any swaps that were created
    // before a certain date and which are still active, we can set this option to that
    // date to avoid processing those swaps.
    const ownSwaps = (await galaSwapApi.getSwapsByWalletAddress(ownWalletAddress)).filter(
      (swap) =>
        !options.ignoreSwapsCreatedBefore ||
        new Date(swap.created) >= options.ignoreSwapsCreatedBefore,
    );

    const ownBalances = await galaSwapApi.getRawBalances(ownWalletAddress);
    const trendingTokenValues = (await galaSwapApi.getTokens()).tokens;

    const projectTokensConfig =
      options.tokenConfig?.projectTokens || defaultTokenConfig.projectTokens;
    const projectTokenValues = (
      await Promise.all(
        projectTokensConfig.map(async (token) => {
          return (await galaSwapApi.getTokens(token.symbol)).tokens;
        }),
      )
    ).flat();

    const allTokenValues = trendingTokenValues.concat(projectTokenValues);
    checkMarketPriceWithinRanges(allTokenValues, options.tokenConfig?.priceLimits);

    await priceStore.addPrices(
      allTokenValues
        .filter((t) => typeof t.currentPrices.usd === 'number')
        .map((tokenValue) => ({
          tokenClass: {
            collection: tokenValue.collection,
            category: tokenValue.category,
            type: tokenValue.type,
            additionalKey: tokenValue.additionalKey,
          },
          price: tokenValue.currentPrices.usd!,
        })),
      options.now ?? new Date(),
    );

    // Diff the current swaps with the ones we have stored in the database
    // and report any whose usesSpent has changed.
    await Promise.all(
      ownSwaps.map(async (swap) => {
        const swapStateBefore = await createdSwapStore.updateSwap(swap);
        if (!swapStateBefore) {
          return;
        }

        const didGetUsed = swapStateBefore.usesSpent !== swap.usesSpent;

        if (didGetUsed) {
          const usesSpentThisUse = BigNumber(swap.usesSpent)
            .minus(swapStateBefore.usesSpent)
            .toString();
          const amountGivenThisUse = BigNumber(swap.offered[0].quantity)
            .multipliedBy(usesSpentThisUse)
            .toNumber();
          const amountReceivedThisUse = BigNumber(swap.wanted[0].quantity)
            .multipliedBy(usesSpentThisUse)
            .toNumber();

          await createdSwapStore.addSwapUse(
            {
              ...swap,
            },
            usesSpentThisUse,
            amountGivenThisUse,
            amountReceivedThisUse,
          );

          await reporter.sendCreatedSwapAcceptedMessage(allTokenValues, swapStateBefore, swap);
        }
      }),
    );

    // Execute each strategy and act on the results it returns (if any).
    for (const strategy of strategies) {
      const { swapsToAccept, swapsToCreate, swapsToTerminate } = await strategy.doTick(
        logger,
        reporter,
        ownWalletAddress,
        galaSwapApi,
        createdSwapStore,
        acceptedSwapStore,
        priceStore,
        ownBalances,
        ownSwaps,
        allTokenValues,
        options,
      );

      const hasActionToTake =
        swapsToAccept.length > 0 || swapsToCreate.length > 0 || swapsToTerminate.length > 0;

      for (const swapToTerminate of swapsToTerminate) {
        await reporter.reportTerminatingSwap(allTokenValues, swapToTerminate);
        await galaSwapApi.terminateSwap(swapToTerminate.swapRequestId);
      }

      for (const swapToAccept of swapsToAccept) {
        const reportPromise = reporter.reportAcceptingSwap(allTokenValues, swapToAccept);
        if (executionDelay) {
          await reportPromise;
          await sleep(executionDelay);
        }

        const [acceptResult] = await Promise.all([
          galaSwapApi.acceptSwap(swapToAccept.swapRequestId, swapToAccept.usesToAccept),
          reportPromise,
        ]);

        await handleSwapAcceptResult(acceptedSwapStore, reporter, swapToAccept, acceptResult);
      }

      for (const swapToCreate of swapsToCreate) {
        await reporter.reportCreatingSwap(allTokenValues, swapToCreate);
        await sleep(executionDelay);
        const createdSwap = await galaSwapApi.createSwap(swapToCreate);
        await createdSwapStore.addSwap(createdSwap);
      }

      if (hasActionToTake) {
        break;
      }
    }
  } catch (err) {
    logger.error(err);
    await reporter.sendAlert(`Error in main loop: ${err}`);
    throw err;
  }
}

export async function mainLoop(loopWaitMs: number, ...params: Parameters<typeof mainLoopTick>) {
  while (true) {
    await mainLoopTick(...params);
    await sleep(loopWaitMs);
  }
}
