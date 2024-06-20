import crypto from 'crypto';
import { ethers } from 'ethers';
import pRetry from 'p-retry';
import util from 'util';
import { ILogger, ITokenClassKey } from '../../types/types.js';
import { signObject } from './galachain_signing.js';
import {
  HttpDelegate,
  IGalaSwapApi,
  IRawSwap,
  acceptSwapResponseSchema,
  availableSwapsResponseSchema,
  balanceResponseSchema,
  createSwapResponseSchema,
  swapsByUserResponseSchema,
  tokenResponseSchema,
} from './types.js';

const sleep = util.promisify(setTimeout);

export class GalaSwapErrorResponse extends Error {
  public readonly uri: string;
  public readonly status: number;
  public readonly errorCode: string;
  public readonly responseText: string;

  private static parseJsonOrUndefined(responseText: string) {
    try {
      return JSON.parse(responseText);
    } catch (e) {
      return undefined;
    }
  }

  constructor(uri: string, status: number, responseText: string) {
    super(`Failed to fetch ${uri}: ${status} ${responseText}`);

    this.responseText = responseText;
    this.uri = uri;
    this.status = status;

    const responseBody = GalaSwapErrorResponse.parseJsonOrUndefined(responseText);
    this.errorCode = responseBody?.error?.ErrorKey ?? responseBody?.error ?? 'UNKNOWN_ERROR';
  }
}

export class GalaSwapApi implements IGalaSwapApi {
  private readonly signerPublicKey: string;

  constructor(
    private readonly baseUrl: string,
    private readonly walletAddress: string,
    private readonly privateKey: string,
    private readonly fetch: HttpDelegate,
    private readonly logger: ILogger,
    private readonly options: { maxRetries?: number } = {},
  ) {
    const publicKeyHex = ethers.SigningKey.computePublicKey(privateKey, true);
    const publicKeyBase64 = Buffer.from(publicKeyHex.replace('0x', ''), 'hex').toString('base64');
    this.signerPublicKey = publicKeyBase64;
  }

  private async fetchJson(
    path: string,
    method: string,
    requiresSignature: boolean,
    options: { body?: unknown } = {},
  ) {
    const authHeaders = requiresSignature
      ? {
          'X-Wallet-Address': this.walletAddress,
        }
      : {};

    const body = requiresSignature
      ? signObject(
          {
            ...(options.body ?? {}),
            signerPublicKey: this.signerPublicKey,
            uniqueKey: `galaswap-operation-${crypto.randomUUID()}`,
          },
          this.privateKey,
        )
      : options.body;

    const uri = `${this.baseUrl}${path}`;

    const response = await this.fetch(uri, {
      method,
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      throw new GalaSwapErrorResponse(uri, response.status, await response.text());
    }

    return response.json() as unknown;
  }

  async getTokens(searchPrefix?: string) {
    const path = searchPrefix ? `/v1/tokens?searchprefix=${searchPrefix}` : '/v1/tokens';
    const tokenResponse = await this.retry(() => this.fetchJson(path, 'GET', false));
    return tokenResponseSchema.parse(tokenResponse);
  }

  async getRawBalances(walletAddress: string) {
    const result = await this.retry(() =>
      this.fetchJson(`/galachain/api/asset/token-contract/FetchBalances`, 'POST', false, {
        body: { owner: walletAddress },
      }),
    );

    const parsedResult = balanceResponseSchema.parse(result);
    return parsedResult.Data;
  }

  async getAvailableSwaps(
    offeredTokenClass: Readonly<ITokenClassKey>,
    wantedTokenClass: Readonly<ITokenClassKey>,
  ) {
    const result = await this.retry(() =>
      this.fetchJson(`/v1/FetchAvailableTokenSwaps`, 'POST', false, {
        body: { offeredTokenClass, wantedTokenClass },
      }),
    );

    const parsedResult = availableSwapsResponseSchema.parse(result);
    return parsedResult.results;
  }

  async acceptSwap(swapRequestId: string, uses: string) {
    try {
      const result = await this.retry(() =>
        this.fetchJson(`/v1/BatchFillTokenSwap`, 'POST', true, {
          body: {
            swapDtos: [
              {
                swapRequestId,
                uses,
              },
            ],
          },
        }),
      );

      acceptSwapResponseSchema.parse(result);

      return { status: 'accepted' as const };
    } catch (err) {
      if (err instanceof GalaSwapErrorResponse && err.errorCode === 'SWAP_ALREADY_USED') {
        return { status: 'already_accepted' as const };
      }

      throw err;
    }
  }

  async terminateSwap(swapRequestId: string) {
    await this.retry(() =>
      this.fetchJson(`/v1/TerminateTokenSwap`, 'POST', true, {
        body: { swapRequestId },
      }),
    );
  }

  async createSwap(newSwap: Readonly<Pick<IRawSwap, 'offered' | 'wanted'>>) {
    const result = await this.fetchJson(`/v1/RequestTokenSwap`, 'POST', true, {
      body: newSwap,
    });

    const parsedResult = createSwapResponseSchema.parse(result);
    return parsedResult.Data;
  }

  async getSwapsByWalletAddress(walletAddress: string) {
    let nextPageBookMark: string | undefined = undefined;
    const results: IRawSwap[] = [];

    do {
      const requestBody = { user: walletAddress, bookmark: nextPageBookMark };

      const result = await this.retry(() =>
        this.fetchJson(
          `/galachain/api/asset/token-contract/FetchTokenSwapsOfferedByUser`,
          'POST',
          false,
          {
            body: requestBody,
          },
        ),
      );

      const parsedResult = swapsByUserResponseSchema.parse(result);
      nextPageBookMark = parsedResult.Data.nextPageBookMark || undefined;
      results.push(...parsedResult.Data.results);
    } while (nextPageBookMark);

    return results;
  }

  private retry<TResponseType>(fn: () => Promise<TResponseType>) {
    return pRetry(fn, {
      retries: this.options.maxRetries ?? 5,
      onFailedAttempt: async (err) => {
        this.logger.warn({
          message: 'GalaSwap API failed request',
          err,
        });

        await sleep(250);
      },
      shouldRetry: async (err: Error) => {
        if (
          err instanceof GalaSwapErrorResponse &&
          err.status < 500 &&
          err.status !== 400 &&
          err.status !== 404 &&
          err.status !== 429
        ) {
          // Non-retriable error
          return false;
        }

        if (err instanceof GalaSwapErrorResponse && err.status === 429) {
          this.logger.warn({
            message: 'GalaSwap API rate limited',
            err: err.responseText,
          });

          await sleep(10_000);
        }

        return true;
      },
    });
  }
}
