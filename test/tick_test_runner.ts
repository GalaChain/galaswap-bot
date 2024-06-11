import assert from 'assert';
import BigNumber from 'bignumber.js';
import { MongoClient } from 'mongodb';
import { MongoAcceptedSwapStore } from '../src/dependencies/accepted_swap_store.js';
import { MongoCreatedSwapStore } from '../src/dependencies/created_swap_store.js';
import { IGalaSwapToken, IRawSwap, ITokenBalance } from '../src/dependencies/galaswap/types.js';
import { MongoPriceStore } from '../src/dependencies/price_store.js';
import { ISwapStrategy } from '../src/strategies/swap_strategy.js';
import { mainLoopTick } from '../src/tick_loop.js';
import { testTokens } from './data/test_tokens.js';
import { MockGalaSwapApi } from './mocks/mock_gala_swap_api.js';
import { mockLogger, noopProxy } from './mocks/noop_proxy.js';

type TickTestStage = (
  | {
      action: 'set_available_swaps';
      swaps: readonly IRawSwap[];
    }
  | {
      action: 'set_token_values';
      tokenValues: readonly IGalaSwapToken[];
    }
  | {
      action: 'set_balances';
      balances: readonly ITokenBalance[];
    }
  | {
      action: 'do_main_loop_tick';
    }
  | {
      action: 'assert_accepted_swap';
      swapId: string | undefined;
    }
  | {
      action: 'assert_limit_given_amount';
      givingSymbol: string;
      receivingSymbol: string;
      rate: number;
      resetIntervalMs: number;
      giveLimitPerReset: number;
      expectedAmount: number;
    }
  | {
      action: 'assert_num_limits_with_given_amount';
      expectedNumLimits: number;
    }
  | {
      action: 'advance_clock';
      byMs: number;
    }
  | {
      action: 'set_next_swap_accept_result';
      result: MockGalaSwapApi['nextSwapStatus'];
    }
  | {
      action: 'assert_created_swap';
      givingToken: string;
      receivingToken: string;
      givingSize: number;
      receivingSize: number;
    }
  | {
      action: 'assert_num_active_own_swaps';
      numActive: number;
    }
  | {
      action: 'set_all_active_swaps_used';
    }
  | {
      action: 'set_latest_swap_uses_spent_portion';
      portion: string;
    }
) & { debugger?: true };

const mongoUri = await process.env.TEST_MONGO_URI;
assert(mongoUri, 'TEST_MONGO_URI must be set');
const mongoClient = new MongoClient(mongoUri);
const db = mongoClient.db('e2e_tick_tests');

export const tickTestRunnerSelfUserId = '635f048ab243d7eb7f5ba044';

export async function tickTestRunner(strategy: ISwapStrategy, stages: TickTestStage[]) {
  await db.dropDatabase();

  const galaSwapApi = new MockGalaSwapApi();
  galaSwapApi.tokens = testTokens;

  const acceptedSwapStore = new MongoAcceptedSwapStore(db);
  const createdSwapStore = new MongoCreatedSwapStore(db);
  const priceStore = new MongoPriceStore(db);

  const now = new Date();

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    assert(stage);
    const stageErrorMessage = `Stage ${i}: ${JSON.stringify(stage, null, 2)}`;

    if (stage.debugger) {
      debugger;
    }

    switch (stage.action) {
      case 'set_available_swaps':
        galaSwapApi.swaps = [...stage.swaps];
        break;
      case 'set_token_values':
        galaSwapApi.tokens = stage.tokenValues;
        break;
      case 'set_balances':
        galaSwapApi.balances = stage.balances;
        break;
      case 'do_main_loop_tick':
        await mainLoopTick(
          tickTestRunnerSelfUserId,
          mockLogger,
          galaSwapApi,
          noopProxy as any,
          createdSwapStore,
          acceptedSwapStore,
          priceStore,
          [strategy],
          0,
          {
            now,
            marketPriceConfig: [],
          },
        );
        break;
      case 'assert_accepted_swap':
        assert.equal(
          galaSwapApi.mostRecentAcceptedSwapId,
          stage.swapId,
          stageErrorMessage +
            `: Expected swap ID ${stage.swapId}, got ${galaSwapApi.mostRecentAcceptedSwapId}`,
        );
        galaSwapApi.mostRecentAcceptedSwapId = undefined;
        break;
      case 'advance_clock':
        now.setTime(now.getTime() + stage.byMs);
        break;
      case 'set_next_swap_accept_result':
        galaSwapApi.nextSwapStatus = stage.result;
        break;
      case 'assert_created_swap':
        const createdSwap = galaSwapApi.mostRecentCreatedSwap;
        assert(createdSwap, stageErrorMessage);

        const uses = createdSwap.uses;

        assert.equal(
          createdSwap.offered[0]!.tokenInstance.collection,
          stage.givingToken,
          stageErrorMessage,
        );
        assert.equal(
          createdSwap.wanted[0]!.tokenInstance.collection,
          stage.receivingToken,
          stageErrorMessage,
        );
        assert.equal(
          BigNumber(createdSwap.offered[0]!.quantity).multipliedBy(uses),
          stage.givingSize.toString(),
          stageErrorMessage,
        );
        assert.equal(
          BigNumber(createdSwap.wanted[0]!.quantity).multipliedBy(uses),
          stage.receivingSize.toString(),
          stageErrorMessage,
        );
        break;
      case 'assert_num_active_own_swaps':
        const ownSwaps = await galaSwapApi.getSwapsByWalletAddress();
        const active = ownSwaps.filter((swap) => Number(swap.usesSpent) < Number(swap.uses));
        assert.equal(active.length, stage.numActive, stageErrorMessage);
        break;
      case 'set_all_active_swaps_used':
        galaSwapApi.swaps = galaSwapApi.swaps.map((swap) => ({
          ...swap,
          usesSpent: swap.uses,
        }));
        break;
      case 'set_latest_swap_uses_spent_portion':
        const createdSwap2 = galaSwapApi.mostRecentCreatedSwap;
        assert(createdSwap2, stageErrorMessage);

        galaSwapApi.setMostRecentSwapUsesSpent(
          BigNumber(createdSwap2.uses).multipliedBy(stage.portion).toString(),
        );
        break;
      default:
        throw new Error(`Unknown stage action`);
    }
  }
}
