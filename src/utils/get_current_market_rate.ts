import assert from 'assert';
import { IGalaSwapToken, IRawSwap } from '../dependencies/galaswap/types.js';
import { Brand } from '../types/branding.js';
import { areSameTokenClass } from '../types/type_helpers.js';
import { ITokenClassKey } from '../types/types.js';

export type ActualSwapRate = Brand<number, 'ActualSwapRate'>;
export type CurrentMarketRate = Brand<number, 'CurrentMarketRate'>;
export type SwapGoodnessRate = Brand<number, 'SwapGoodnessRate'>;

// Current market rate is defined as how many of the token the bot can receive for each 1 of the token it's giving.
// e.x. if $GALA is currently at 0.05 and the bot is giving token $GUSDC, then the current market rate is 20.
// Because 1 GUSDC gets the bot 20 GALA.
// The higher this number, the better the swap.
export function getCurrentMarketRate(
  givingTokenClass: ITokenClassKey,
  receivingTokenClass: ITokenClassKey,
  tokenValues: readonly IGalaSwapToken[],
) {
  const givingTokenValue = tokenValues.find((token) => areSameTokenClass(token, givingTokenClass));
  const receivingTokenValue = tokenValues.find((token) =>
    areSameTokenClass(token, receivingTokenClass),
  );

  if (!givingTokenValue?.currentPrices?.usd || !receivingTokenValue?.currentPrices?.usd) {
    return undefined;
  }

  const rate = givingTokenValue.currentPrices.usd / receivingTokenValue.currentPrices.usd;
  assert(!Number.isNaN(rate) && rate > 0, 'Invalid market rate');

  return rate as CurrentMarketRate;
}

export function getSwapGoodnessRate(
  swapRate: ActualSwapRate,
  currentMarketRate: CurrentMarketRate,
) {
  return (swapRate / currentMarketRate) as SwapGoodnessRate;
}

export function getActualSwapRate(givingAmount: number, receivingAmount: number) {
  const rate = Number(receivingAmount) / Number(givingAmount);
  assert(!Number.isNaN(rate) && rate > 0, 'Invalid rate');
  return rate as ActualSwapRate;
}

export function getActualSwapRateForCandidateToAccept(swap: Pick<IRawSwap, 'wanted' | 'offered'>) {
  // What the swap offerer wants is what "I" (the bot) gives
  const iGiveQuantity = swap.wanted[0].quantity;
  const iReceiveQuantity = swap.offered[0].quantity;

  return getActualSwapRate(Number(iGiveQuantity), Number(iReceiveQuantity));
}

export function getActualSwapRateForSwapICreated(swap: Pick<IRawSwap, 'wanted' | 'offered'>) {
  const iGiveQuantity = swap.offered[0].quantity;
  const iReceiveQuantity = swap.wanted[0].quantity;

  return getActualSwapRate(Number(iGiveQuantity), Number(iReceiveQuantity));
}
