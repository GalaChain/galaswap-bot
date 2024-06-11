import { BasicSwapCreatorStrategy } from '../../src/strategies/basic_swap_creator/basic_swap_creator_strategy.js';
import {
  IMaxNewQuantityCreatedLimit,
  ITargetActiveSwaps,
} from '../../src/strategies/basic_swap_creator/types.js';
import {
  makeBalance,
  makeTargetActiveSwap,
  makeTokenClass,
  makeTokenValue,
} from '../test_helpers.js';
import { tickTestRunner } from '../tick_test_runner.js';
import { defaultTestSwapCreatorConfig } from './default_test_swap_creator_config.js';

describe('Basic swap creator tick tests', async () => {
  it('Can do several realistic ticks', async () => {
    const targetActiveSwaps: ITargetActiveSwaps[] = [
      makeTargetActiveSwap({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        targetGivingSize: 10,
        targetProfitability: 1.1,
        minProfitability: 1,
      }),
    ];

    const balances = [makeBalance({ collection: 'GUSDC', quantity: '1000' })];

    await tickTestRunner(
      new BasicSwapCreatorStrategy({
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps,
      }),
      [
        {
          action: 'set_balances',
          balances,
        },
        {
          action: 'set_token_values',
          tokenValues: [
            makeTokenValue({ collection: 'GALA', usd: 0.05 }),
            makeTokenValue({ collection: 'GUSDC', usd: 1 }),
          ],
        },
        {
          action: 'do_main_loop_tick',
        },
        {
          action: 'assert_created_swap',
          givingToken: 'GUSDC',
          receivingToken: 'GALA',
          givingSize: 10,
          receivingSize: 220, //  10 * (1 / 0.05) * 1.1
        },
        {
          action: 'set_token_values',
          tokenValues: [
            makeTokenValue({ collection: 'GALA', usd: 0.051 }),
            makeTokenValue({ collection: 'GUSDC', usd: 1 }),
          ],
        },
        // Does not create a swap because we have one open already
        {
          action: 'do_main_loop_tick',
        },
        {
          action: 'assert_created_swap',
          givingToken: 'GUSDC',
          receivingToken: 'GALA',
          givingSize: 10,
          receivingSize: 220, // ceil(10 * (1 / 0.051) * 1.1)
        },
      ],
    );
  });

  it('Respects limits', async () => {
    const targetActiveSwaps: ITargetActiveSwaps[] = [
      makeTargetActiveSwap({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        targetGivingSize: 10,
        targetProfitability: 1.1,
        minProfitability: 1,
      }),
    ];

    const creationLimits: IMaxNewQuantityCreatedLimit[] = [
      {
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        giveLimitPerReset: 15,
        resetIntervalMs: 60_000,
      },
    ];

    const balances = [makeBalance({ collection: 'GUSDC', quantity: '1000' })];

    await tickTestRunner(
      new BasicSwapCreatorStrategy({
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps,
        creationLimits,
      }),
      [
        {
          action: 'set_balances',
          balances,
        },
        {
          action: 'set_token_values',
          tokenValues: [
            makeTokenValue({ collection: 'GALA', usd: 0.05 }),
            makeTokenValue({ collection: 'GUSDC', usd: 1 }),
          ],
        },
        {
          action: 'do_main_loop_tick',
        },
        {
          action: 'set_latest_swap_uses_spent_portion',
          portion: '1',
        },
        {
          action: 'do_main_loop_tick',
        },
        {
          action: 'do_main_loop_tick',
        },
        // We should not create a swap here because we have reached the limit
        {
          action: 'assert_num_active_own_swaps',
          numActive: 0,
        },
        {
          action: 'advance_clock',
          byMs: 300_000,
        },
        {
          action: 'do_main_loop_tick',
        },
        {
          action: 'assert_num_active_own_swaps',
          numActive: 1,
        },
      ],
    );
  });
});
