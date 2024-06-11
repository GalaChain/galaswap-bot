import assert from 'assert';
import BigNumber from 'bignumber.js';
import { calculateSwapQuantitiesAndUses } from '../src/utils/swap_uses.js';

describe('Swap use calculator tests', () => {
  it('Truncates excessive decimals in receivingTokenAmount', () => {
    const result = calculateSwapQuantitiesAndUses(
      8,
      8,
      BigNumber(1500),
      BigNumber('148.37767732267733925'),
    );

    assert.equal(result.receivingQuantity, '37.09441933');
    assert.equal(result.uses, '4');
  });
});
