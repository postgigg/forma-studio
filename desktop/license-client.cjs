const {generateKeyPairSync, createPrivateKey, createPublicKey, sign} = require('node:crypto');
const {readFile, writeFile, rename, stat, mkdir} = require('node:fs/promises');
const path = require('node:path');
const protocol = require('../shared/license-protocol.cjs');
class LicenseError extends Error { constructor(code, message) { super(message); this.code = code; } }
class MacLicenseClient {
  constructor({file, safeStorage, hardwareHash, config, request}) {
    Object.assign(this, {file, safeStorage, hardwareHash, config, request});
  }
  async load() {
    if (!this.safeStorage.isEncryptionAvailable()) throw new LicenseError('KEYCHAIN_UNAVAILABLE', 'Unlock your Mac keychain, then reopen Forma Studio.');
    try {
      if ((await stat(this.file)).size > 65536) throw Error('oversized profile');
      this.profile = JSON.parse(this.safeStorage.decryptString(await readFile(this.file)));
      if (this.profile.schemaVersion !== 1 || this.profile.product !== this.config.product || this.profile.hardwareHash !== this.hardwareHash || protocol.publicKeyHash(this.profile.publicKey) !== protocol.publicKeyHash(createPublicKey(createPrivateKey(this.profile.privateKey)).export({type:'spki',format:'pem'}))) throw Error('invalid profile');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new LicenseError('PROFILE_UNAVAILABLE', 'This Mac’s activation could not be read. Unlock your keychain and try again. Your designs have not been changed.');
      const pair = generateKeyPairSync('ed25519');
      this.profile = {schemaVersion:1, product:this.config.product, hardwareHash:this.hardwareHash, publicKey:pair.publicKey.export({type:'spki',format:'pem'}), privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'})};
      await this.save();
    }
    return this.valid();
  }
  valid() {
    if (!this.profile?.license) return false;
    try { protocol.verifyEntitlement(this.profile.license, {...this.config, publicKey:this.profile.publicKey, hardwareHash:this.hardwareHash}); return true; }
    catch { return false; }
  }
  async save() {
    await mkdir(path.dirname(this.file), {recursive:true,mode:0o700});
    const pending = this.file + '.pending';
    await writeFile(pending, this.safeStorage.encryptString(JSON.stringify(this.profile)), {mode:0o600});
    await rename(pending, this.file);
  }
  async activate(value) {
    if (this.valid()) return true;
    let licenseKey;
    try { licenseKey = protocol.normalizeLicenseKey(value); }
    catch { throw new LicenseError('INVALID_KEY', 'Enter the complete Forma Mac key from your purchase.'); }
    if (!this.config.issuers.length) throw new LicenseError('LICENSE_UNAVAILABLE', 'Mac activation is not available in this build.');
    const device = {publicKey:this.profile.publicKey, hardwareHash:this.hardwareHash};
    // Persist the signed request before sending it. If its response is lost, retry the
    // exact nonce so the server recovers the original grant without a second activation.
    const existing = this.profile.pending;
    if (existing && existing.licenseKey !== licenseKey) throw new LicenseError('ACTIVATION_PENDING', 'Finish activating the key you already submitted before using another key.');
    if (!existing) {
      const challenge = await this.request('/api/mac/challenge', device);
      const signature = sign(null, protocol.activationMessage({...challenge,...device,licenseKey}), createPrivateKey(this.profile.privateKey)).toString('base64url');
      this.profile.pending = {licenseKey,challengeId:challenge.id,...device,signature};
      await this.save();
    }
    let result;
    try { result = await this.request('/api/mac/activate',this.profile.pending); }
    catch (error) {
      if (['NONCE_EXPIRED','INVALID_KEY','KEY_ALREADY_USED','NONCE_USED','INVALID_CHALLENGE','INVALID_PROOF'].includes(error.code)) { delete this.profile.pending; await this.save(); }
      throw error;
    }
    protocol.verifyEntitlement(result.license,{...this.config,...device});
    this.profile.license = result.license;
    delete this.profile.pending;
    await this.save();
    return true;
  }
}
module.exports = {MacLicenseClient,LicenseError};
