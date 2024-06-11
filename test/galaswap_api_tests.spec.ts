import assert from 'assert';
import { GalaSwapApi, GalaSwapErrorResponse } from '../src/dependencies/galaswap/galaswap_api.js';
import { mockLogger } from './mocks/noop_proxy.js';

describe('GalaSwap API tests', () => {
  const unauthenticatedApi = new GalaSwapApi(
    'https://api-galaswap.gala.com',
    'client|abcde',
    '0x0000000000000000000000000000000000000000000000000000000000000001',
    fetch,
    mockLogger,
    { maxRetries: 0 },
  );

  it('Can fetch swaps', async () => {
    const swaps = await unauthenticatedApi.getAvailableSwaps(
      {
        collection: 'GALA',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
      {
        collection: 'GUSDC',
        category: 'Unit',
        type: 'none',
        additionalKey: 'none',
      },
    );

    assert(Array.isArray(swaps));
  }).timeout(10_000);

  it('Can fetch tokens', async () => {
    const tokens = await unauthenticatedApi.getTokens();
    assert(Array.isArray(tokens.tokens));
  }).timeout(10_000);

  it('Can fetch balances', async () => {
    const balances = await unauthenticatedApi.getRawBalances('client|012301230123012301230123');
    assert(Array.isArray(balances));
  }).timeout(10_000);

  it('Throws error when trying to accept swap without authentication', async () => {
    try {
      await unauthenticatedApi.acceptSwap('some-id', '1');
      assert.fail('Expected error to be thrown');
    } catch (err) {
      assert(
        err instanceof GalaSwapErrorResponse,
        'Expected error to be instance of GalaSwapErrorResponse',
      );

      assert.equal(err.errorCode, 'PK_NOT_FOUND');
    }
  }).timeout(10_000);
});
