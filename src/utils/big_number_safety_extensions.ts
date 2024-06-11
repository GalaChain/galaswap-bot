import assert from 'assert';
import BigNumber from 'bignumber.js';

BigNumber.config({ DECIMAL_PLACES: 32 });

const oldToString = BigNumber.prototype.toString;
const oldToFixed = BigNumber.prototype.toFixed;

BigNumber.prototype.toString = function (...args: any[]) {
  assert(!this.isNaN(), 'Tried to stringify NaN BigNumber');
  return oldToString.call(this, ...args);
};

BigNumber.prototype.toFixed = function (...args: any[]) {
  assert(!this.isNaN(), 'Tried to call toFixed() on NaN BigNumber');
  return (oldToFixed as any).call(this, ...args);
};
