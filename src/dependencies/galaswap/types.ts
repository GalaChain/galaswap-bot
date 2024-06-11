import { z } from 'zod';
import { ITokenClassKey, tokenInstanceKeySchema } from '../../types/types.js';

export const galaSwapTokenSchema = z
  .object({
    symbol: z.string(),
    collection: z.string(),
    category: z.string(),
    type: z.string(),
    additionalKey: z.string(),
    decimals: z.number(),
    currentPrices: z
      .object({
        usd: z.number().optional(),
      })
      .readonly(),
  })
  .readonly();

export type IGalaSwapToken = z.infer<typeof galaSwapTokenSchema>;

export const tokenResponseSchema = z
  .object({
    tokens: z.array(galaSwapTokenSchema).readonly(),
  })
  .readonly();

export const tokenBalanceSchema = z
  .object({
    collection: z.string(),
    category: z.string(),
    type: z.string(),
    additionalKey: z.string(),
    quantity: z.string(),
    lockedHolds: z
      .array(
        z
          .object({
            expires: z.number(),
            quantity: z.string(),
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

export type ITokenBalance = z.infer<typeof tokenBalanceSchema>;

export const balanceResponseSchema = z
  .object({
    Data: z.array(tokenBalanceSchema).readonly(),
  })
  .readonly();

export const swapResponseElementSchema = z
  .object({
    offered: z
      .tuple([
        z
          .object({
            quantity: z.string(),
            tokenInstance: tokenInstanceKeySchema,
          })
          .readonly(),
      ])
      .readonly(),
    wanted: z
      .tuple([
        z
          .object({
            quantity: z.string(),
            tokenInstance: tokenInstanceKeySchema,
          })
          .readonly(),
      ])
      .readonly(),
    swapRequestId: z.string(),
    created: z.number(),
    expires: z.number(),
    uses: z.string(),
    usesSpent: z.string(),
    offeredBy: z.string(),
  })
  .readonly();

export type IRawSwap = z.infer<typeof swapResponseElementSchema>;

export const createSwapResponseSchema = z
  .object({
    Data: swapResponseElementSchema,
  })
  .readonly();

export const availableSwapsResponseSchema = z
  .object({
    results: z.array(swapResponseElementSchema).readonly(),
  })
  .readonly();

export const swapsByUserResponseSchema = z
  .object({
    Data: z
      .object({
        nextPageBookMark: z.string(),
        results: z.array(swapResponseElementSchema).readonly(),
      })
      .readonly(),
  })
  .readonly();

export const acceptSwapResponseSchema = z.object({}).readonly();

export interface IGalaSwapApi {
  getTokens(): Promise<{
    tokens: readonly Readonly<IGalaSwapToken>[];
  }>;
  getRawBalances(userId: string): Promise<readonly Readonly<ITokenBalance>[]>;
  getAvailableSwaps(
    offeredTokenClass: Readonly<ITokenClassKey>,
    wantedTokenClass: Readonly<ITokenClassKey>,
  ): Promise<readonly Readonly<IRawSwap>[]>;
  acceptSwap(
    swapId: string,
    uses: string,
  ): Promise<Readonly<{ status: 'accepted' | 'already_accepted' }>>;
  createSwap(newSwap: Readonly<Pick<IRawSwap, 'offered' | 'wanted'>>): Promise<Readonly<IRawSwap>>;
  terminateSwap(swapId: string): Promise<void>;
  getSwapsByWalletAddress(walletAddress: string): Promise<readonly Readonly<IRawSwap>[]>;
}

type FetchReturnValue = Awaited<ReturnType<typeof fetch>>;

type Response = {
  ok: FetchReturnValue['ok'];
  status: FetchReturnValue['status'];
  json: FetchReturnValue['json'];
  text: FetchReturnValue['text'];
};

export type HttpDelegate = (
  uri: string,
  options?: Parameters<typeof fetch>[1],
) => Promise<Response>;
