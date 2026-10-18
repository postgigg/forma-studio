const { createHash, createPublicKey, verify } = require('node:crypto');
const keyPattern = /^FORMAMAC([A-HJ-NP-Z2-9]{32})$/;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function normalizeLicenseKey(value) {
  if (typeof value !== 'string' || value.length > 100) throw new Error('INVALID_KEY');
  const match = keyPattern.exec(value.toUpperCase().replace(/[\s-]/g, ''));
  if (!match) throw new Error('INVALID_KEY');
  return 'FORMA-MAC-' + match[1].match(/.{4}/g).join('-');
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function publicKeyHash(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error('INVALID_DEVICE');
  const key = createPublicKey(value);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('INVALID_DEVICE');
  return digest(key.export({ type: 'spki', format: 'der' }));
}
function activationMessage({ id, nonce, publicKey, hardwareHash, licenseKey }) {
  if (!uuid(id) || !/^[a-zA-Z0-9_-]{43}$/.test(nonce) || !hex(hardwareHash)) throw new Error('INVALID_CHALLENGE');
  return Buffer.from(['forma-mac-activation-v1', id, nonce, publicKeyHash(publicKey), hardwareHash, digest(normalizeLicenseKey(licenseKey))].join('\n'));
}
function verifyEntitlement(token, { issuers, product, publicKey, hardwareHash }) {
  if (typeof token !== 'string' || token.length > 8192 || !hex(hardwareHash)) throw new Error('INVALID_LICENSE');
  const parts = token.split('.');
  if (parts.length !== 2 || parts.some(p => !/^[a-zA-Z0-9_-]+$/.test(p))) throw new Error('INVALID_LICENSE');
  const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_LICENSE');
  const issuer = issuers.find(i => i.id === payload.issuer);
  if (!issuer || !verify(null, Buffer.from(parts[0]), createPublicKey(issuer.publicKey), Buffer.from(parts[1], 'base64url'))) throw new Error('INVALID_LICENSE');
  if (payload.schemaVersion !== 1 || payload.product !== product || !uuid(payload.licenseId) || !Number.isFinite(Date.parse(payload.activatedAt)) || payload.deviceKeyHash !== publicKeyHash(publicKey) || payload.hardwareHash !== hardwareHash) throw new Error('WRONG_DEVICE');
  return payload;
}
module.exports = { normalizeLicenseKey, digest, publicKeyHash, activationMessage, verifyEntitlement, hex, uuid };
