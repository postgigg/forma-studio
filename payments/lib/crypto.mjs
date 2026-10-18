import { randomBytes, createHmac, createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import protocol from '../../shared/license-protocol.cjs';
export { protocol };
export function keyHash(key, pepper) { return createHmac('sha256', pepper).update(protocol.normalizeLicenseKey(key)).digest('hex'); }
export function secretHash(value, pepper) { return createHmac('sha256', pepper).update(value).digest('hex'); }
export function createLicenseKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let bits = 0, value = 0, result = '';
  for (const byte of randomBytes(20)) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return 'FORMA-MAC-' + result.match(/.{4}/g).join('-');
}
export function encryptKey(value, encryptionKey) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(b => b.toString('base64url')).join('.');
}
export function decryptKey(value, encryptionKey) {
  const [iv, tag, bytes] = value.split('.').map(p => Buffer.from(p, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey, iv); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(bytes), cipher.final()]).toString('utf8');
}
export function signer(privatePem, config) {
  const privateKey = createPrivateKey(privatePem), publicKey = createPublicKey(privateKey);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('INVALID_SIGNER');
  const issuer = config.issuers.find(i => i.id === config.currentIssuerId);
  if (!issuer || !publicKey.export({ type: 'spki', format: 'der' }).equals(createPublicKey(issuer.publicKey).export({ type: 'spki', format: 'der' }))) throw new Error('INVALID_SIGNER');
  return payload => {
    const encoded = Buffer.from(JSON.stringify({ ...payload, schemaVersion: 1, product: config.product, issuer: issuer.id })).toString('base64url');
    return encoded + '.' + sign(null, Buffer.from(encoded), privateKey).toString('base64url');
  };
}
