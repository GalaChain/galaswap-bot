import assert from 'assert';
import BigNumber from 'bignumber.js';
import { IRawSwap } from '../../src/dependencies/galaswap/types.js';
import { getSwapsToCreate } from '../../src/strategies/basic_swap_creator/get_swap_to_create.js';
import { mainLoopTick } from '../../src/tick_loop.js';
import { MockGalaSwapApi } from '../mocks/mock_gala_swap_api.js';
import { mockLogger, noopProxy } from '../mocks/noop_proxy.js';
import {
  makeBalance,
  makeTargetActiveSwap,
  makeTokenClass,
  makeTokenValue,
} from '../test_helpers.js';
import { defaultTestSwapCreatorConfig } from './default_test_swap_creator_config.js';

function zeroQuantityCreatedSince() {
  return Promise.resolve(0);
}

function undefinedPriceChangePercent() {
  return Promise.resolve(undefined);
}

describe('Basic swap creator tests', () => {
  it('Should create swap with the correct parameters', async () => {
    const createdSwaps: IRawSwap[] = [];
    const targets = [
      makeTargetActiveSwap({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        targetProfitability: 1.1,
        minProfitability: 0,
        maxProfitability: 2,
        targetGivingSize: 150,
      }),
    ];

    const ownBalances = [makeBalance({ collection: 'GUSDC', quantity: '1000' })];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapsToCreate1 = await getSwapsToCreate(
      mockLogger,
      ownBalances,
      createdSwaps,
      tokenValues,
      {
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps: targets,
      },
      zeroQuantityCreatedSince,
      undefinedPriceChangePercent,
    );

    const swapToCreate1 = swapsToCreate1[0];
    assert(swapToCreate1);
    assert.equal(swapToCreate1.offered[0].tokenInstance.collection, 'GUSDC');
    assert.equal(swapToCreate1.wanted[0].tokenInstance.collection, 'GALA');

    const uses = BigNumber(swapToCreate1.uses);
    assert.equal(BigNumber(swapToCreate1.offered[0].quantity).multipliedBy(uses), '150');
    assert.equal(BigNumber(swapToCreate1.wanted[0].quantity).multipliedBy(uses), '3300'); // 150 * 20 * 1.1
  });

  it('Should not create swaps if it does not have enough tokens', async () => {
    const createdSwaps: IRawSwap[] = [];
    const targets = [
      makeTargetActiveSwap({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        targetProfitability: 1.1,
        minProfitability: 0,
        maxProfitability: 2,
        targetGivingSize: 150,
      }),
    ];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapToCreate1 = await getSwapsToCreate(
      mockLogger,
      [makeBalance({ collection: 'GUSDC', quantity: '149' })],
      createdSwaps,
      tokenValues,
      {
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps: targets,
      },
      zeroQuantityCreatedSince,
      undefinedPriceChangePercent,
    );

    assert.equal(swapToCreate1.length, 0);

    const swapToCreate2 = await getSwapsToCreate(
      mockLogger,
      [makeBalance({ collection: 'GUSDC', quantity: '150' })],
      createdSwaps,
      tokenValues,
      defaultTestSwapCreatorConfig,
      zeroQuantityCreatedSince,
      undefinedPriceChangePercent,
    );

    assert(swapToCreate2);
  });

  it('Should not create swaps if it does not have enough tokens (with token locks in play)', async () => {
    const createdSwaps: IRawSwap[] = [];
    const targets = [
      makeTargetActiveSwap({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        targetProfitability: 1.1,
        minProfitability: 0,
        maxProfitability: 2,
        targetGivingSize: 150,
      }),
    ];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapToCreate1 = await getSwapsToCreate(
      mockLogger,
      [
        makeBalance({
          collection: 'GUSDC',
          quantity: '152',
          lockedHolds: [
            { quantity: '2', expires: 0 },
            { quantity: '1', expires: 0 },
          ],
        }),
      ],
      createdSwaps,
      tokenValues,
      {
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps: targets,
      },
      zeroQuantityCreatedSince,
      undefinedPriceChangePercent,
    );

    assert.equal(swapToCreate1.length, 0);

    const swapToCreate2 = await getSwapsToCreate(
      mockLogger,
      [
        makeBalance({
          collection: 'GUSDC',
          quantity: '152',
          lockedHolds: [{ quantity: '2', expires: 0 }],
        }),
      ],
      createdSwaps,
      tokenValues,
      defaultTestSwapCreatorConfig,
      zeroQuantityCreatedSince,
      undefinedPriceChangePercent,
    );

    assert(swapToCreate2);
  });

  it('Should ceil receiving amount when receiving GALA', async () => {
    const createdSwaps: IRawSwap[] = [];
    const targets = [
      makeTargetActiveSwap({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        targetProfitability: 1.0899,
        minProfitability: 0,
        maxProfitability: 2,
        targetGivingSize: 150,
      }),
    ];

    const ownBalances = [makeBalance({ collection: 'GUSDC', quantity: '1000' })];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapTosCreate1 = await getSwapsToCreate(
      mockLogger,
      ownBalances,
      createdSwaps,
      tokenValues,
      {
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps: targets,
      },
      zeroQuantityCreatedSince,
      undefinedPriceChangePercent,
    );

    const swapToCreate1 = swapTosCreate1[0];
    assert(swapToCreate1);

    const uses = BigNumber(swapToCreate1.uses);
    assert.equal(BigNumber(swapToCreate1.offered[0].quantity).multipliedBy(uses), '150');
    assert.equal(BigNumber(swapToCreate1.wanted[0].quantity).multipliedBy(uses), '3270'); // ceil(150 * 20 * 1.0899)
  });

  it('Should error when market prices are out of specified range', async () => {
    const galaSwapApi = new MockGalaSwapApi();
    galaSwapApi.tokens = [makeTokenValue({ collection: 'GALA', usd: 0.01 })];

    const err = await mainLoopTick(
      'blah',
      noopProxy as any,
      galaSwapApi,
      noopProxy as any,
      noopProxy as any,
      noopProxy as any,
      noopProxy as any,
      [],
      0,
      {
        tokenConfig: {
          priceLimits: [
            {
              collection: 'GALA',
              category: 'Unit',
              type: 'none',
              additionalKey: 'none',
              min: 0.02,
              max: 0.03,
            },
          ],
          projectTokens: [],
        },
      },
    ).catch((err) => err);

    assert(err instanceof Error && err.message.includes('is below minimum specified price'));
  });

  it('Respects volatility limits', async () => {
    const createdSwaps: IRawSwap[] = [];
    const targets = [
      makeTargetActiveSwap({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        maxPriceMovementPercent: 0.03,
        maxPriceMovementWindowMs: 1000,
      }),
    ];

    const ownBalances = [makeBalance({ collection: 'GUSDC', quantity: '1000' })];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapTosCreate1 = await getSwapsToCreate(
      mockLogger,
      ownBalances,
      createdSwaps,
      tokenValues,
      {
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps: targets,
      },
      zeroQuantityCreatedSince,
      async () => 0.02,
    );

    assert.equal(swapTosCreate1.length, 1);

    const swapTosCreate2 = await getSwapsToCreate(
      mockLogger,
      ownBalances,
      createdSwaps,
      tokenValues,
      {
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps: targets,
      },
      zeroQuantityCreatedSince,
      async () => 0.04,
    );

    assert.equal(swapTosCreate2.length, 0);
  });
});
