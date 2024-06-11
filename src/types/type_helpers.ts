import assert from 'assert';
import { ITokenClassKey } from './types.js';

export function areSameTokenClass(tokenA: ITokenClassKey, tokenB: ITokenClassKey): boolean {
  return (
    tokenA.collection === tokenB.collection &&
    tokenA.category === tokenB.category &&
    tokenA.type === tokenB.type &&
    tokenA.additionalKey === tokenB.additionalKey
  );
}

export function stringifyTokenClass(token: ITokenClassKey): string {
  return `${token.collection}|${token.category}|${token.type}|${token.additionalKey}`;
}

export function parseStringifiedTokenClass(token: string): ITokenClassKey {
  const [collection, category, type, additionalKey] = token.split('|');
  assert(collection && category && type && additionalKey, `Invalid token class string: ${token}`);
  return { collection, category, type, additionalKey };
}
