import { BasicSwapAccepterStrategy } from '../../src/strategies/basic_swap_accepter/basic_swap_accepter_strategy.js';
import { makeAvailableSwap, makeBalance, makeTokenValue } from '../test_helpers.js';
import { tickTestRunner } from '../tick_test_runner.js';

describe('Basic swap accepter tick tests', async () => {
  it('Respects volatility limits', async () => {
    const balances = [
      makeBalance({ collection: 'GUSDC', quantity: '1000' }),
      makeBalance({ collection: 'GALA', quantity: '1000' }),
    ];

    await tickTestRunner(new BasicSwapAccepterStrategy(), [
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
        action: 'set_available_swaps',
        swaps: [
          makeAvailableSwap({
            id: '1',
            offeredCollection: 'GUSDC',
            wantedCollection: 'GALA',
            offeredQuantity: '1',
            wantedQuantity: '1',
          }),
        ],
      },
      {
        action: 'do_main_loop_tick',
      },
      {
        action: 'assert_accepted_swap',
        swapId: '1',
      },
      {
        action: 'set_token_values',
        tokenValues: [
          makeTokenValue({ collection: 'GALA', usd: 0.06 }),
          makeTokenValue({ collection: 'GUSDC', usd: 1 }),
        ],
      },
      {
        action: 'set_available_swaps',
        swaps: [
          makeAvailableSwap({
            id: '2',
            offeredCollection: 'GUSDC',
            wantedCollection: 'GALA',
            offeredQuantity: '1',
            wantedQuantity: '1',
          }),
        ],
      },
      {
        action: 'do_main_loop_tick',
      },
      {
        action: 'assert_accepted_swap',
        swapId: undefined,
      },
      {
        action: 'advance_clock',
        byMs: 3600000 / 2,
      },
      {
        action: 'do_main_loop_tick',
      },
      {
        action: 'assert_accepted_swap',
        swapId: undefined,
      },
      {
        action: 'advance_clock',
        byMs: 3600000 / 2 + 1,
      },
      {
        action: 'do_main_loop_tick',
      },
      {
        action: 'assert_accepted_swap',
        swapId: '2',
      },
    ]);
  });
});
