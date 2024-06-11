import { MongoAcceptedSwapStore } from '../dependencies/accepted_swap_store.js';
import { MongoCreatedSwapStore } from '../dependencies/created_swap_store.js';
import {
  IGalaSwapApi,
  IGalaSwapToken,
  IRawSwap,
  ITokenBalance,
} from '../dependencies/galaswap/types.js';
import { MongoPriceStore } from '../dependencies/price_store.js';
import { IStatusReporter } from '../dependencies/status_reporters.js';
import { ILogger } from '../types/types.js';

export type ISwapToCreate = Pick<IRawSwap, 'offered' | 'wanted' | 'uses'>;
export type ISwapToAccept = IRawSwap & {
  usesToAccept: string;
  goodnessRating: number;
};
export type ISwapToTerminate = IRawSwap & {
  terminationReason?: string;
};

export interface ISwapStrategy {
  doTick(
    logger: ILogger,
    reporter: IStatusReporter,
    selfUserId: string,
    galaSwapApi: IGalaSwapApi,
    createdSwapStore: MongoCreatedSwapStore,
    acceptedSwapStore: MongoAcceptedSwapStore,
    priceStore: MongoPriceStore,
    ownBalances: readonly Readonly<ITokenBalance>[],
    ownSwaps: readonly Readonly<IRawSwap>[],
    tokenValues: readonly Readonly<IGalaSwapToken>[],
    options: { now?: Date },
  ): Promise<{
    swapsToTerminate: readonly Readonly<ISwapToTerminate>[];
    swapsToAccept: readonly Readonly<ISwapToAccept>[];
    swapsToCreate: readonly Readonly<ISwapToCreate>[];
  }>;
}
