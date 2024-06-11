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

  const signature = Buffer.from(ecSecp256k1.sign(keccak256Hash, privateKeyBuffer).toDER()).toString(
    'base64',
  );

  return {
    ...toSign,
    signature,
  };
}
