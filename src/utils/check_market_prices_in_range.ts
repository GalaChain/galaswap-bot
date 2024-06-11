import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { IGalaSwapToken } from '../dependencies/galaswap/types.js';
import { areSameTokenClass, stringifyTokenClass } from '../types/type_helpers.js';

const marketPriceConfigSchema = z
  .array(
    z
      .object({
        collection: z.string(),
        category: z.string(),
        type: z.string(),
        additionalKey: z.string(),
        min: z.number(),
        max: z.number(),
      })
      .readonly(),
  )
  .readonly();

export type IMarketPriceConfig = z.infer<typeof marketPriceConfigSchema>;

const marketPriceDefaultConfig = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, '..', '..', 'config', 'market_price_config.json'),
    'utf-8',
  ),
);

const parsedMarketPriceDefaultConfig = marketPriceConfigSchema.parse(marketPriceDefaultConfig);

export function checkMarketPriceWithinRanges(
  tokenValues: readonly IGalaSwapToken[],
  config = parsedMarketPriceDefaultConfig,
) {
  for (const token of config) {
    const matchingValue = tokenValues.find((tv) => areSameTokenClass(tv, token));
    if (typeof matchingValue?.currentPrices.usd !== 'number') {
      throw new Error(`Could not find token value for ${stringifyTokenClass(token)}`);
    }

    if (matchingValue.currentPrices.usd < token.min) {
      throw new Error(`Token ${token} is below minimum specified price`);
    }

    if (matchingValue.currentPrices.usd > token.max) {
      throw new Error(`Token ${token} is above maximum specified price`);
    }
  }
}
