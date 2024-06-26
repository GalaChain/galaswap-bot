import assert from 'assert';
import { getSwapsToAccept } from '../../src/strategies/basic_swap_accepter/get_swap_to_accept.js';
import { areSameTokenClass } from '../../src/types/type_helpers.js';
import { ITokenClassKey } from '../../src/types/types.js';
import { testTokens } from '../data/test_tokens.js';
import { noopProxy } from '../mocks/noop_proxy.js';
import { makeAvailableSwap, makeBalance, makePairLimit, makeTokenClass } from '../test_helpers.js';

const baseArguments = {
  pairLimits: [makePairLimit()] as ReadonlyArray<ReturnType<typeof makePairLimit>>, // GUSDC/GALA rate of 1, 1000 per hour
  availableSwaps: [makeAvailableSwap()] as ReadonlyArray<ReturnType<typeof makeAvailableSwap>>, // Giving 100 GUSDC, receiving 2000 GALA
  ownBalances: [
    makeBalance({ quantity: '1000' }),
    makeBalance({ collection: 'GALA' }),
  ] as ReadonlyArray<ReturnType<typeof makeBalance>>, // 1000 GUSDC, 0 GALA
  galaSwapTokens: testTokens, // GUSDC $1, GALA $0.05
  ownUserId: 'client|me',
  quantityGivenSince: 0,
  getPriceChangePercent: async (_tokenClass: ITokenClassKey, _since: Date, _until: Date) => 0,
};

function argumentsToFunctionParameters(
  args: typeof baseArguments,
): Parameters<typeof getSwapsToAccept> {
  return [
    noopProxy as any,
    args.ownUserId,
    args.pairLimits,
    args.ownBalances,
    args.galaSwapTokens,
    async (
      givingTokenClass: Readonly<ITokenClassKey>,
      receivingTokenClass: Readonly<ITokenClassKey>,
    ) =>
      args.availableSwaps.filter(
        (s) =>
          areSameTokenClass(s.wanted[0].tokenInstance, givingTokenClass) &&
          areSameTokenClass(s.offered[0].tokenInstance, receivingTokenClass),
      ),
    async () => args.quantityGivenSince,
    args.getPriceChangePercent,
    {},
  ];
}

describe('Basic swap accepter tests', () => {
  it('Should return a swap to accept in basic default case', async () => {
    const result = await getSwapsToAccept(...argumentsToFunctionParameters(baseArguments));
    assert(result[0]);
    assert.strictEqual(result[0].usesToAccept, '1');
    assert.strictEqual(result[0].swapRequestId, baseArguments.availableSwaps[0]!.swapRequestId);
  });

  it('Should ignore swaps that it does not have pair limits for', async () => {
    const result = await getSwapsToAccept(
      ...argumentsToFunctionParameters({
        ...baseArguments,
        pairLimits: [],
      }),
    );

    assert.equal(result.length, 0);
  });

  it('Should default own balances to 0', async () => {
    const result = await getSwapsToAccept(
      ...argumentsToFunctionParameters({
        ...baseArguments,
        ownBalances: [],
      }),
    );

    // It thinks its own balance is 0, meaning it can't accept the swap
    assert.equal(result.length, 0);
  });

  it('Does not take swaps if its own balance is too low', async () => {
    const result = await getSwapsToAccept(
      ...argumentsToFunctionParameters({
        ...baseArguments,
        availableSwaps: [
          makeAvailableSwap({
            wantedCollection: 'GUSDC',
            wantedQuantity: '100',
            offeredCollection: 'GALA',
            offeredQuantity: '2000',
          }),
        ],
        ownBalances: [makeBalance({ quantity: '99', collection: 'GUSDC' })],
      }),
    );

    assert.equal(result.length, 0);
  });

  it('Correctly calculates how many uses of a swap to use when limited by giving limits', async () => {
    const pairLimits = [
      makePairLimit({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        rate: 1,
        giveLimitPerReset: 45,
      }),
    ] as const;

    const availableSwaps = [
      makeAvailableSwap({
        wantedCollection: 'GUSDC',
        wantedQuantity: '10',
        offeredCollection: 'GALA',
        offeredQuantity: '200',
        uses: '10',
      }),
    ];

    const results = await getSwapsToAccept(
      ...argumentsToFunctionParameters({
        ...baseArguments,
        availableSwaps,
        pairLimits,
      }),
    );

    assert.equal(results[0]?.usesToAccept, '4');
  });

  it('Respects volatility limits', async () => {
    const pairLimits = [
      makePairLimit({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        rate: 1,
        giveLimitPerReset: 45,
        maxPriceMovementPercent: 0.03,
        maxPriceMovementWindowMs: 1000,
      }),
    ] as const;

    const availableSwaps = [
      makeAvailableSwap({
        wantedCollection: 'GUSDC',
        wantedQuantity: '10',
        offeredCollection: 'GALA',
        offeredQuantity: '200',
        uses: '10',
      }),
    ];

    const results1 = await getSwapsToAccept(
      ...argumentsToFunctionParameters({
        ...baseArguments,
        availableSwaps,
        pairLimits,
        getPriceChangePercent: async () => 0.04,
      }),
    );

    assert.equal(results1.length, 0);

    const results2 = await getSwapsToAccept(
      ...argumentsToFunctionParameters({
        ...baseArguments,
        availableSwaps,
        pairLimits,
        getPriceChangePercent: async () => 0.02,
      }),
    );

    assert.equal(results2.length, 1);
  });

  it('Respects minReceivingTokenAmount', async () => {
    const pairLimits = [
      makePairLimit({
        givingTokenClass: makeTokenClass('GUSDC'),
        receivingTokenClass: makeTokenClass('GALA'),
        rate: 1,
        minReceivingTokenAmount: 100,
      }),
    ] as const;

    const swapWithEnoughToAccept = makeAvailableSwap({
      wantedCollection: 'GUSDC',
      wantedQuantity: '10',
      offeredCollection: 'GALA',
      offeredQuantity: '200',
      uses: '10',
    });

    const swapWithoutEnoughToAccept = {
      ...swapWithEnoughToAccept,
      usesSpent: '6', // only has 80 GALA left to give, already gave 120 of the total 200
    };

    const results1 = await getSwapsToAccept(
      ...argumentsToFunctionParameters({
        ...baseArguments,
        availableSwaps: [swapWithEnoughToAccept],
        pairLimits,
      }),
    );

    assert.equal(results1.length, 1);

    const results2 = await getSwapsToAccept(
      ...argumentsToFunctionParameters({
        ...baseArguments,
        availableSwaps: [swapWithoutEnoughToAccept],
        pairLimits,
      }),
    );

    assert.equal(results2.length, 0);
  });
});
