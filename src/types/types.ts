import pino from 'pino';
import { z } from 'zod';

export interface ILogger {
  info: ReturnType<typeof pino>['info'];
  error: ReturnType<typeof pino>['error'];
  warn: ReturnType<typeof pino>['warn'];
}

export const tokenClassKeySchema = z
  .object({
    collection: z.string(),
    category: z.string(),
    type: z.string(),
    additionalKey: z.string(),
  })
  .readonly();

export type ITokenClassKey = z.infer<typeof tokenClassKeySchema>;

export const tokenInstanceKeySchema = z
  .object({
    collection: z.string(),
    category: z.string(),
    type: z.string(),
    additionalKey: z.string(),
    instance: z.literal('0'),
  })
  .readonly();

export type ITokenInstanceKey = z.infer<typeof tokenInstanceKeySchema>;
