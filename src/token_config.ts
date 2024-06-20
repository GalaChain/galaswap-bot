import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const tokenConfigSchema = z
  .object({
    priceLimits: z
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
      .readonly(),
    projectTokens: z
      .array(
        z
          .object({
            symbol: z.string(),
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

export type ITokenConfig = z.infer<typeof tokenConfigSchema>;

const unparsedDefaultTokenConfig = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'config', 'token_config.json'), 'utf-8'),
);

export const defaultTokenConfig = tokenConfigSchema.parse(unparsedDefaultTokenConfig);
