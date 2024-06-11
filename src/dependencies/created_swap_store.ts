import { Db } from 'mongodb';
import { ITokenClassKey } from '../types/types.js';
import { IRawSwap } from './galaswap/types.js';

interface IStoredCreatedSwapUse extends IRawSwap {
  useTime: Date;
  usesSpentThisUse: string;
  offeredAmountGivenThisUse: number;
  receivedAmountGivenThisUse: number;
}

export class MongoCreatedSwapStore {
  constructor(private readonly db: Db) {}

  get createdSwapsCollection() {
    return this.db.collection<Readonly<IRawSwap>>('created_swaps');
  }

  get createdSwapUsesCollection() {
    return this.db.collection<Readonly<IStoredCreatedSwapUse>>('created_swap_uses');
  }

  init() {
    return Promise.all([
      this.createdSwapsCollection.createIndex({
        swapRequestId: 1,
      }),
      this.createdSwapUsesCollection.createIndex({
        useTime: 1,
      }),
    ]);
  }

  async addSwap(swap: Readonly<IRawSwap>) {
    await this.createdSwapsCollection.insertOne({
      ...swap,
    });
  }

  async addSwapUse(
    swap: Readonly<IRawSwap>,
    usesSpentThisUse: string,
    offeredAmountGivenThisUse: number,
    receivedAmountGivenThisUse: number,
  ) {
    await this.createdSwapUsesCollection.insertOne({
      ...swap,
      useTime: new Date(),
      usesSpentThisUse,
      offeredAmountGivenThisUse,
      receivedAmountGivenThisUse,
    });
  }

  async updateSwap(swap: Readonly<IRawSwap>) {
    const beforeDocument = await this.createdSwapsCollection.findOneAndUpdate(
      {
        swapRequestId: swap.swapRequestId,
      },
      {
        $set: {
          ...swap,
        },
      },
      {
        upsert: true,
      },
    );

    return beforeDocument;
  }

  async getTotalOfferedQuantityGivenSince(
    offeredTokenClass: Readonly<ITokenClassKey>,
    wantedTokenClass: Readonly<ITokenClassKey>,
    since: Readonly<Date>,
  ) {
    const documents = await this.createdSwapUsesCollection
      .find({
        'offered.tokenInstance.collection': offeredTokenClass.collection,
        'offered.tokenInstance.category': offeredTokenClass.category,
        'offered.tokenInstance.type': offeredTokenClass.type,
        'offered.tokenInstance.additionalKey': offeredTokenClass.additionalKey,
        'wanted.tokenInstance.collection': wantedTokenClass.collection,
        'wanted.tokenInstance.category': wantedTokenClass.category,
        'wanted.tokenInstance.type': wantedTokenClass.type,
        'wanted.tokenInstance.additionalKey': wantedTokenClass.additionalKey,
        useTime: { $gte: since },
      })
      .toArray();

    const result = documents.reduce((total, document) => {
      return total + document.offeredAmountGivenThisUse;
    }, 0);

    return result;
  }
}
