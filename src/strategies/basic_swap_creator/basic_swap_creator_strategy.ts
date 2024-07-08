import fs from 'fs';
import path from 'path';
import { MongoAcceptedSwapStore } from '../../dependencies/accepted_swap_store.js';
import { MongoCreatedSwapStore } from '../../dependencies/created_swap_store.js';
import {
  IGalaSwapApi,
  IGalaSwapToken,
  IRawSwap,
  ITokenBalance,
} from '../../dependencies/galaswap/types.js';
import { MongoPriceStore } from '../../dependencies/price_store.js';
import { IStatusReporter } from '../../dependencies/status_reporters.js';
import { ILogger, ITokenClassKey } from '../../types/types.js';
import { ISwapStrategy } from '../swap_strategy.js';
import { getSwapsToCreate } from './get_swap_to_create.js';
import { getSwapsToTerminate } from './get_swaps_to_terminate.js';
import { basicSwapCreatorConfigSchema } from './types.js';

const rawConfig = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, '..', '..', '..', 'config', 'basic_swap_creator.json'),
    'utf8',
  ),
);

export const defaultBasicSwapCreatorConfig = basicSwapCreatorConfigSchema.parse(rawConfig);

export class BasicSwapCreatorStrategy implements ISwapStrategy {
  constructor(private readonly config = defaultBasicSwapCreatorConfig) {}

  async doTick(
    logger: ILogger,
    reporter: IStatusReporter,
    _selfUserId: string,
    _galaSwapApi: IGalaSwapApi,
    createdSwapStore: MongoCreatedSwapStore,
    _acceptedSwapStore: MongoAcceptedSwapStore,
    priceStore: MongoPriceStore,
    ownBalances: readonly Readonly<ITokenBalance>[],
    ownSwaps: readonly Readonly<IRawSwap>[],
    tokenValues: readonly Readonly<IGalaSwapToken>[],
    options: {
      now?: Date;
    },
  ): ReturnType<ISwapStrategy['doTick']> {
    if (!this.config.active) {
      return {
        swapsToTerminate: [],
        swapsToCreate: [],
        swapsToAccept: [],
      };
    }

    const swapsToTerminate = await getSwapsToTerminate(
      ownSwaps,
      tokenValues,
      this.config.targetActiveSwaps,
    );

    const swapsToCreate = await getSwapsToCreate(
      reporter,
      logger,
      ownBalances,
      ownSwaps,
      tokenValues,
      this.config,
      async (offeredTokenClass: ITokenClassKey, receivedTokenClass: ITokenClassKey, since: Date) =>
        createdSwapStore.getTotalOfferedQuantityGivenSince(
          offeredTokenClass,
          receivedTokenClass,
          since,
        ),
      async (tokenClass: ITokenClassKey, since: Date, until: Date) =>
        priceStore.getPriceChangePercent(tokenClass, since, until),
      options,
    );

    return {
      swapsToTerminate,
      swapsToCreate,
      swapsToAccept: [],
    };
  }
}
