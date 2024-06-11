import assert from 'assert';
import BigNumber from 'bignumber.js';

interface ISwapQuantitiesAndUsesValues {
  givingTokenQuantity: BigNumber;
  receivingTokenQuantity: BigNumber;
  uses: BigNumber;
}

const greatestCommonDivisor = (a: BigNumber, b: BigNumber): BigNumber =>
  a.isZero() ? b : greatestCommonDivisor(b.mod(a), a);

function calculateSwapQuantitiesAndUsesValues(
  givingTokenDecimals: number,
  receivingTokenDecimals: number,
  givingTokenAmount: BigNumber,
  receivingTokenAmount: BigNumber,
) {
  const givingTokenQuantumAmount = BigNumber(
    givingTokenAmount.toFixed(givingTokenDecimals, BigNumber.ROUND_FLOOR),
  ).multipliedBy(BigNumber(10).pow(givingTokenDecimals));

  const receivingTokenQuantumAmount = BigNumber(
    receivingTokenAmount.toFixed(receivingTokenDecimals, BigNumber.ROUND_FLOOR),
  ).multipliedBy(BigNumber(10).pow(receivingTokenDecimals));

  const gcd = greatestCommonDivisor(givingTokenQuantumAmount, receivingTokenQuantumAmount);

  const givingTokenQuantity = givingTokenQuantumAmount
    .dividedBy(gcd)
    .dividedBy(BigNumber(10).pow(givingTokenDecimals));

  const receivingTokenQuantity = receivingTokenQuantumAmount
    .dividedBy(gcd)
    .dividedBy(BigNumber(10).pow(receivingTokenDecimals));

  const uses = gcd;

  return {
    givingTokenQuantity,
    receivingTokenQuantity,
    uses,
  };
}

function validateSwapQuantitiesAndUsesValues({
  givingTokenQuantity,
  receivingTokenQuantity,
  uses,
}: ISwapQuantitiesAndUsesValues) {
  return (
    uses.isInteger() &&
    uses.isPositive() &&
    givingTokenQuantity.isPositive() &&
    receivingTokenQuantity.isPositive()
  );
}

export function calculateSwapQuantitiesAndUses(
  givingTokenDecimals: number,
  receivingTokenDecimals: number,
  givingTokenAmount: BigNumber,
  receivingTokenAmount: BigNumber,
) {
  const result = calculateSwapQuantitiesAndUsesValues(
    givingTokenDecimals,
    receivingTokenDecimals,
    givingTokenAmount,
    receivingTokenAmount,
  );

  const outputs = {
    givingQuantity: result.givingTokenQuantity.toFixed(),
    receivingQuantity: result.receivingTokenQuantity.toFixed(),
    uses: result.uses.toString(),
  };

  assert(
    validateSwapQuantitiesAndUsesValues(result),
    'calculateSwapQuantitiesAndUses outputs failed Sanity check ' +
      JSON.stringify({
        inputs: {
          givingTokenDecimals,
          receivingTokenDecimals,
          givingTokenAmount: givingTokenAmount.toFixed(),
          receivingTokenAmount: receivingTokenAmount.toFixed(),
        },
        outputs,
      }),
  );

  return outputs;
}
