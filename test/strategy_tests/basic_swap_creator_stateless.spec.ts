import assert from 'assert';
import BigNumber from 'bignumber.js';
import { IRawSwap } from '../../src/dependencies/galaswap/types.js';
import { getSwapsToCreate } from '../../src/strategies/basic_swap_creator/get_swap_to_create.js';
import { getSwapsToTerminate } from '../../src/strategies/basic_swap_creator/get_swaps_to_terminate.js';
import { mainLoopTick } from '../../src/tick_loop.js';
import { MockGalaSwapApi } from '../mocks/mock_gala_swap_api.js';
import { mockLogger, mockReporter, noopProxy } from '../mocks/noop_proxy.js';
import {
  createTestSwap,
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

    const ownBalances = [
      makeBalance({ collection: 'GUSDC', quantity: '1000' }),
      makeBalance({ collection: 'GALA', quantity: '1' }),
    ];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapsToCreate1 = await getSwapsToCreate(
      mockReporter,
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
      mockReporter,
      mockLogger,
      [
        makeBalance({ collection: 'GUSDC', quantity: '149' }),
        makeBalance({ collection: 'GALA', quantity: '1' }),
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
      mockReporter,
      mockLogger,
      [
        makeBalance({ collection: 'GUSDC', quantity: '150' }),
        makeBalance({ collection: 'GALA', quantity: '1' }),
      ],
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
      mockReporter,
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
        makeBalance({ collection: 'GALA', quantity: '1' }),
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
      mockReporter,
      mockLogger,
      [
        makeBalance({
          collection: 'GUSDC',
          quantity: '152',
          lockedHolds: [{ quantity: '2', expires: 0 }],
        }),
        makeBalance({ collection: 'GALA', quantity: '1' }),
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

    const ownBalances = [
      makeBalance({ collection: 'GUSDC', quantity: '1000' }),
      makeBalance({ collection: 'GALA', quantity: '1' }),
    ];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapTosCreate1 = await getSwapsToCreate(
      mockReporter,
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

    const ownBalances = [
      makeBalance({ collection: 'GUSDC', quantity: '1000' }),
      makeBalance({ collection: 'GALA', quantity: '1' }),
    ];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapTosCreate1 = await getSwapsToCreate(
      mockReporter,
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
      mockReporter,
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

  it('Respects givingTokenClassMinimumValue', async () => {
    const createdSwaps: IRawSwap[] = [];
    const targets = [
      makeTargetActiveSwap({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        targetProfitability: 1.1,
        minProfitability: 1,
        maxProfitability: 2,
        targetGivingSize: 1000,
        givingTokenClassMinimumValue: 10,
      }),
    ];

    const ownBalances = [
      makeBalance({ collection: 'GUSDC', quantity: '1000' }),
      makeBalance({ collection: 'GALA', quantity: '1' }),
    ];

    const tokenValues = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 1 }),
    ];

    const swapsToCreate1 = await getSwapsToCreate(
      mockReporter,
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

    // Make sure it created a swap using the minimum value specified for GUSDC (10) rather than the actual value (1)
    const swapToCreate1 = swapsToCreate1[0];
    assert(swapToCreate1);
    assert.equal(swapToCreate1.offered[0].tokenInstance.collection, 'GUSDC');
    assert.equal(swapToCreate1.wanted[0].tokenInstance.collection, 'GALA');
    const uses = BigNumber(swapToCreate1.uses);
    assert.equal(BigNumber(swapToCreate1.offered[0].quantity).multipliedBy(uses), '1000');
    assert.equal(BigNumber(swapToCreate1.wanted[0].quantity).multipliedBy(uses), '220000'); // 10 * 1000 / 0.05 * 1.1

    // Make sure it doesn't terminate that swap right after creation
    const swapsToTerminate1 = await getSwapsToTerminate(
      [createTestSwap(swapToCreate1)],
      tokenValues,
      targets,
    );
    assert.equal(swapsToTerminate1.length, 0);

    const tokenValues2 = [
      makeTokenValue({ collection: 'GALA', usd: 0.05 }),
      makeTokenValue({ collection: 'GUSDC', usd: 15 }), // Increase the actual value of GUSDC to 15
    ];

    // Make sure it terminates the swap now that the actual value of GUSDC is so much higher
    const swapsToTerminate2 = await getSwapsToTerminate(
      [createTestSwap(swapToCreate1)],
      tokenValues2,
      targets,
    );

    assert.equal(swapsToTerminate2.length, 1);

    const swapsToCreate2 = await getSwapsToCreate(
      mockReporter,
      mockLogger,
      ownBalances,
      [],
      tokenValues2,
      {
        ...defaultTestSwapCreatorConfig,
        targetActiveSwaps: targets,
      },
      zeroQuantityCreatedSince,
      undefinedPriceChangePercent,
    );

    // Make sure that when the actual value of GUSDC is higher than the min, it uses the actual value
    assert.equal(swapsToCreate2.length, 1);
    const swapToCreate2 = swapsToCreate2[0];
    assert(swapToCreate2);
    assert.equal(swapToCreate2.offered[0].tokenInstance.collection, 'GUSDC');
    assert.equal(swapToCreate2.wanted[0].tokenInstance.collection, 'GALA');
    assert.equal(BigNumber(swapToCreate2.offered[0].quantity).multipliedBy(uses), '1000');
    assert.equal(BigNumber(swapToCreate2.wanted[0].quantity).multipliedBy(uses), '330000'); // 15 * 1000 / 0.05 * 1.1
  });
});
