import { IGalaSwapToken } from '../dependencies/galaswap/types.js';
import { defaultTokenConfig } from '../token_config.js';
import { areSameTokenClass, stringifyTokenClass } from '../types/type_helpers.js';

export function checkMarketPriceWithinRanges(
  tokenValues: readonly IGalaSwapToken[],
  config = defaultTokenConfig.priceLimits,
) {
  for (const token of config) {
    const matchingValue = tokenValues.find((tv) => areSameTokenClass(tv, token));
    if (typeof matchingValue?.currentPrices.usd !== 'number') {
      throw new Error(`Could not find token value for ${stringifyTokenClass(token)}`);
    }

    if (matchingValue.currentPrices.usd < token.min) {
      throw new Error(`Token ${stringifyTokenClass(token)} is below minimum specified price`);
    }

    if (matchingValue.currentPrices.usd > token.max) {
      throw new Error(`Token ${stringifyTokenClass(token)} is above maximum specified price`);
    }
  }
}
