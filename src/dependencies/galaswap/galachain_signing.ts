import BN from 'bn.js';
import ellipticPkg from 'elliptic';
import jsSha3Pkg from 'js-sha3';
import stringify from 'json-stringify-deterministic';

const { keccak256 } = jsSha3Pkg;
const { ec: EC } = ellipticPkg;
const ecSecp256k1 = new EC('secp256k1');

export function signObject<TInputType extends object>(
  obj: Readonly<TInputType>,
  privateKey: string,
): TInputType & { signature: string } {
  const toSign = { ...obj };

  if ('signature' in toSign) {
    delete toSign.signature;
  }

  const stringToSign = stringify(toSign);
  const stringToSignBuffer = Buffer.from(stringToSign);

  const keccak256Hash = Buffer.from(keccak256.digest(stringToSignBuffer));
  const privateKeyBuffer = Buffer.from(privateKey.replace(/^0x/, ''), 'hex');

  const signature = ecSecp256k1.sign(keccak256Hash, privateKeyBuffer);

  // Normalize the signature if it's greater than half of order n
  if (signature.s.cmp(ecSecp256k1.curve.n.shrn(1)) > 0) {
    const curveN = ecSecp256k1.curve.n;
    const newS = new BN(curveN).sub(signature.s);
    const newRecoverParam = signature.recoveryParam != null ? 1 - signature.recoveryParam : null;
    signature.s = newS;
    signature.recoveryParam = newRecoverParam;
  }

  const signatureString = Buffer.from(signature.toDER()).toString('base64');

  return {
    ...toSign,
    signature: signatureString,
  };
}
