import BigNumber from 'bignumber.js';
import { ITokenBalance } from '../dependencies/galaswap/types.js';
import { ITokenClassKey } from '../types/types.js';

export interface IUseableBalance extends ITokenClassKey {
  quantity: string;
  _type: 'IUseableBalance';
}

export function galaChainObjectIsExpired(obj: { expires: number }) {
  return obj.expires > 0 && obj.expires < Date.now();
}

export function getUseableBalances(rawBalances: readonly ITokenBalance[]): IUseableBalance[] {
  return rawBalances.map((b) => {
    const sumLocked = b.lockedHolds
      .filter((h) => !galaChainObjectIsExpired(h))
      .reduce((acc, hold) => acc.plus(hold.quantity), BigNumber(0));

    return {
      collection: b.collection,
      category: b.category,
      type: b.type,
      additionalKey: b.additionalKey,
      quantity: BigNumber(b.quantity).minus(sumLocked).toString(),
      _type: 'IUseableBalance' as const,
    };
  });
}
