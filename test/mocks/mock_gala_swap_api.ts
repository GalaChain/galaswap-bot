import {
  IGalaSwapApi,
  IGalaSwapToken,
  IRawSwap,
  ITokenBalance,
} from '../../src/dependencies/galaswap/types.js';
import { ITokenClassKey } from '../../src/types/types.js';

export class MockGalaSwapApi implements IGalaSwapApi {
  tokens: readonly IGalaSwapToken[] = [];
  balances: readonly ITokenBalance[] = [];
  swaps: IRawSwap[] = [];
  mostRecentAcceptedSwapId: string | undefined;
  mostRecentTerminatedSwap: IRawSwap | undefined;
  nextSwapStatus: 'accepted' | 'already_accepted' = 'accepted';

  constructor() {}

  get mostRecentCreatedSwap() {
    return this.swaps[this.swaps.length - 1];
  }

  getTokens() {
    return Promise.resolve({ tokens: this.tokens });
  }

  getRawBalances() {
    return Promise.resolve(this.balances);
  }

  setMostRecentSwapUsesSpent(usesSpent: string) {
    const swap = this.swaps.pop();
    this.swaps.push({ ...swap!, usesSpent });
  }

  getAvailableSwaps(
    offeredTokenClass: ITokenClassKey,
    wantedTokenClass: ITokenClassKey,
  ): Promise<IRawSwap[]> {
    const matchingSwaps = this.swaps.filter((swap) => {
      return (
        swap.offered[0]!.tokenInstance.collection === wantedTokenClass.collection &&
        swap.wanted[0]!.tokenInstance.collection === offeredTokenClass.collection
      );
    });

    return Promise.resolve(matchingSwaps);
  }

  acceptSwap(swapId: string) {
    const thisAttemptStatus = this.nextSwapStatus;
    this.nextSwapStatus = 'accepted';

    if (thisAttemptStatus === 'accepted') {
      this.swaps = this.swaps.filter((swap) => swap.swapRequestId !== swapId);
      this.mostRecentAcceptedSwapId = swapId;
    }

    return Promise.resolve({ status: thisAttemptStatus });
  }

  createSwap(newSwap: Pick<IRawSwap, 'offered' | 'wanted' | 'uses'>) {
    const swap = {
      ...newSwap,
      created: Date.now(),
      expires: 0,
      swapRequestId: Math.random().toString(),
      usesSpent: '0',
      offeredBy: 'client|me',
    };

    this.swaps.push(swap);
    return Promise.resolve(swap);
  }

  terminateSwap(swapId: string): Promise<void> {
    this.mostRecentTerminatedSwap = this.swaps.find((swap) => swap.swapRequestId === swapId);
    this.swaps = this.swaps.filter((swap) => swap.swapRequestId !== swapId);
    return Promise.resolve();
  }

  getSwapsByWalletAddress() {
    return Promise.resolve(this.swaps);
  }
}
