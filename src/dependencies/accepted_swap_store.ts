import { Db } from 'mongodb';
import { IRawSwap } from './galaswap/types.js';

interface IStoredAcceptedSwap extends IRawSwap {
  amountGiven: number;
  givenStringifiedTokenClassKey: string;
  receivedStringifiedTokenClassKey: string;
  amountReceived: number;
  acceptedAt: Date;
  goodnessRating: number;
}

export class MongoAcceptedSwapStore {
  constructor(private readonly db: Db) {}

  get collection() {
    return this.db.collection<IStoredAcceptedSwap>('accepted_swaps');
  }

  init() {
    return this.collection.createIndex({
      givenStringifiedTokenClassKey: 1,
      receivedStringifiedTokenClassKey: 1,
      acceptedAt: 1,
      goodnessRating: 1,
    });
  }

  async addAcceptedSwap(
    swap: Readonly<IRawSwap>,
    givenStringifiedTokenClassKey: string,
    receivedStringifiedTokenClassKey: string,
    amountGiven: number,
    amountReceived: number,
    goodnessRating: number,
  ) {
    await this.collection.insertOne({
      ...swap,
      amountGiven,
      givenStringifiedTokenClassKey,
      receivedStringifiedTokenClassKey,
      amountReceived,
      acceptedAt: new Date(),
      goodnessRating,
    } satisfies IStoredAcceptedSwap);
  }

  async getAmountAcceptedSince(
    givenStringifiedTokenClassKey: string,
    receivedStringifiedTokenClassKey: string,
    since: Date,
    goodnessRatingAtLeast: number,
  ) {
    const swaps = await this.collection
      .find({
        givenStringifiedTokenClassKey,
        receivedStringifiedTokenClassKey,
        acceptedAt: { $gte: since },
        goodnessRating: { $gte: goodnessRatingAtLeast },
      } satisfies Partial<Record<keyof IStoredAcceptedSwap, unknown>>)
      .toArray();

    return swaps.reduce((acc, swap) => acc + swap.amountGiven, 0);
  }
}
