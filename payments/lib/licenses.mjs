import { randomUUID, randomBytes, createPublicKey, verify } from 'node:crypto';
import { protocol, keyHash, secretHash, createLicenseKey, encryptKey, decryptKey } from './crypto.mjs';
import priceSpec from '../config/product.json' with { type: 'json' };
export class ServiceError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export async function transaction(pool, action) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout='10s'"); await client.query("SET LOCAL lock_timeout='5s'"); const result = await action(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
export class LicenseService {
  constructor({ pool, stripe, pepper, deliveryKey, signGrant, priceId, product, release, origin, accountId }) {
    Object.assign(this, { pool, stripe, pepper, deliveryKey, signGrant, priceId, product, release, origin, accountId });
    this.accountVerifiedUntil = 0;
  }
  async verifyMerchant(checkout = false) {
    if (Date.now() >= this.accountVerifiedUntil) {
      const account = await this.stripe.accounts.retrieve();
      if (account.id !== this.accountId) throw new ServiceError('CHECKOUT_UNAVAILABLE', 503);
      this.chargesEnabled = account.charges_enabled;
      this.accountVerifiedUntil = Date.now() + 60000;
    }
    if (checkout && !this.chargesEnabled) throw new ServiceError('CHECKOUT_UNAVAILABLE', 503);
  }
  async rateLimit(ip, action, limit) {
    const bucket = Math.floor(Date.now() / 900000);
    const result = await this.pool.query(`INSERT INTO forma_mac_rate_limits(client_hash, action, bucket, hits) VALUES ($1,$2,$3,1) ON CONFLICT (client_hash,action,bucket) DO UPDATE SET hits=forma_mac_rate_limits.hits+1 RETURNING hits`, [secretHash(ip || 'unknown', this.pepper), action, bucket]);
    if (result.rows[0].hits > limit) throw new ServiceError('RATE_LIMITED', 429);
  }
  async createCheckout() {
    await this.verifyMerchant(true);
    const price = await this.stripe.prices.retrieve(this.priceId);
    if (!price.active || price.type !== priceSpec.type || price.recurring || price.currency !== priceSpec.currency || price.unit_amount !== priceSpec.amount) throw new ServiceError('CHECKOUT_UNAVAILABLE', 503);
    const id = randomUUID(), cookie = randomBytes(32).toString('hex');
    await this.pool.query('INSERT INTO forma_mac_checkout_attempts(id,cookie_hash) VALUES($1,$2)', [id, secretHash(cookie, this.pepper)]);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment', line_items: [{ price: this.priceId, quantity: 1 }], allow_promotion_codes: false,
      adaptive_pricing: { enabled: false },
      integration_identifier: 'forma_mac_' + randomBytes(8).map(byte => 97 + byte % 26).toString('ascii'),
      metadata: { forma_product: this.product, forma_attempt_id: id }, client_reference_id: id,
      invoice_creation: { enabled: true, invoice_data: { description: 'Forma Studio for Mac — one-time license for one Mac', metadata: { forma_product: this.product, forma_attempt_id: id } } },
      success_url: `${this.origin}/mac.html?purchase=${id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.origin}/mac.html?cancelled=1`,
    }, { idempotencyKey: 'forma-mac-checkout-' + id });
    if (new URL(session.url).hostname !== 'checkout.stripe.com') throw new ServiceError('CHECKOUT_UNAVAILABLE', 503);
    await this.pool.query('UPDATE forma_mac_checkout_attempts SET stripe_session_id=$2 WHERE id=$1', [id, session.id]);
    return { id, cookie, url: session.url };
  }
  async fulfill(event) {
    await this.verifyMerchant();
    if (event.account && event.account !== this.accountId) throw new ServiceError('PAYMENT_NOT_ELIGIBLE', 400);
    if (['charge.refunded', 'charge.dispute.created'].includes(event.type)) return this.revokePayment(event);
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'].includes(event.type)) return { ignored: true };
    const session = await this.stripe.checkout.sessions.retrieve(event.data.object.id, { expand: ['line_items', 'payment_intent.latest_charge'] });
    if (session.metadata?.forma_product !== this.product) return { ignored: true };
    if (event.type === 'checkout.session.async_payment_failed' && session.payment_status !== 'paid') {
      if (!protocol.uuid(session.metadata.forma_attempt_id)) return { ignored: true };
      await this.pool.query('UPDATE forma_mac_checkout_attempts SET payment_failed=true WHERE id=$1 AND stripe_session_id=$2', [session.metadata.forma_attempt_id, session.id]);
      return { failed: true };
    }
    if (session.payment_status !== 'paid') return { pending: true };
    const lines = session.line_items?.data, intent = session.payment_intent, charge = intent?.latest_charge;
    if (session.mode !== 'payment' || session.currency !== priceSpec.currency || session.amount_subtotal !== priceSpec.amount || session.amount_total < priceSpec.amount || session.metadata?.forma_product !== this.product || !lines || lines.length !== 1 || session.line_items.has_more || lines[0].price?.id !== this.priceId || lines[0].quantity !== 1 || intent?.status !== 'succeeded' || !charge || typeof charge !== 'object' || charge.refunded || charge.disputed || charge.amount_refunded !== 0) throw new ServiceError('PAYMENT_NOT_ELIGIBLE', 400);
    const attemptId = session.metadata.forma_attempt_id;
    if (!protocol.uuid(attemptId)) throw new ServiceError('PAYMENT_NOT_ELIGIBLE', 400);
    return transaction(this.pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [intent.id]);
      const attempt = await client.query('SELECT id FROM forma_mac_checkout_attempts WHERE id=$1 AND stripe_session_id=$2', [attemptId, session.id]);
      if (!attempt.rowCount) throw new ServiceError('PAYMENT_NOT_ELIGIBLE', 400);
      const inserted = await client.query(`INSERT INTO forma_mac_webhook_events(event_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id`, [event.id, event.type]);
      if (!inserted.rowCount) return { duplicate: true };
      const paid = await client.query(`INSERT INTO forma_mac_payments(id,checkout_session_id,payment_intent_id,attempt_id,amount,currency,customer_email,status) VALUES($1,$2,$3,$4,$5,'usd',$6,'paid') ON CONFLICT(checkout_session_id) DO NOTHING RETURNING id`, [randomUUID(), session.id, intent.id, attemptId, session.amount_total, session.customer_details?.email || null]);
      if (!paid.rowCount) return { duplicate: true };
      const blocked = await client.query('SELECT status FROM forma_mac_payment_blocks WHERE payment_intent_id=$1', [intent.id]);
      if (blocked.rowCount) {
        await client.query('UPDATE forma_mac_payments SET status=$2 WHERE id=$1', [paid.rows[0].id, blocked.rows[0].status]);
        return { revoked: true };
      }
      const key = createLicenseKey();
      await client.query(`INSERT INTO forma_mac_licenses(id,payment_id,key_hash,key_ciphertext) VALUES($1,$2,$3,$4)`, [randomUUID(), paid.rows[0].id, keyHash(key, this.pepper), encryptKey(key, this.deliveryKey)]);
      return { issued: true };
    });
  }
  async revokePayment(event) {
    const object = event.data.object;
    const intentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
    if (!intentId) return { ignored: true };
    const known = await this.pool.query('SELECT id FROM forma_mac_payments WHERE payment_intent_id=$1', [intentId]);
    if (!known.rowCount) {
      // Follow Stripe's Checkout ownership boundary for an out-of-order refund.
      // Do not retain another product's payment records from a shared account.
      const sessions = await this.stripe.checkout.sessions.list({ payment_intent: intentId, limit: 1 });
      const session = sessions.data[0];
      if (!session || session.metadata?.forma_product !== this.product || !protocol.uuid(session.metadata.forma_attempt_id)) return { ignored: true };
      const attempt = await this.pool.query('SELECT id FROM forma_mac_checkout_attempts WHERE id=$1 AND stripe_session_id=$2', [session.metadata.forma_attempt_id, session.id]);
      if (!attempt.rowCount) return { ignored: true };
    }
    return transaction(this.pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [intentId]);
      const inserted = await client.query('INSERT INTO forma_mac_webhook_events(event_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id', [event.id, event.type]);
      if (!inserted.rowCount) return { duplicate: true };
      await client.query('INSERT INTO forma_mac_payment_blocks(payment_intent_id,status) VALUES($1,$2) ON CONFLICT(payment_intent_id) DO UPDATE SET status=EXCLUDED.status', [intentId, event.type === 'charge.refunded' ? 'refunded' : 'disputed']);
      const updated = await client.query('UPDATE forma_mac_payments SET status=$2 WHERE payment_intent_id=$1 RETURNING id', [intentId, event.type === 'charge.refunded' ? 'refunded' : 'disputed']);
      if (!updated.rowCount) return { ignored: true };
      await client.query("UPDATE forma_mac_licenses SET state='revoked',key_ciphertext=NULL WHERE payment_id=$1", [updated.rows[0].id]);
      return { revoked: true };
    });
  }
  async receipt(id, cookie) {
    if (!protocol.uuid(id) || !/^[a-f0-9]{64}$/.test(cookie || '')) throw new ServiceError('PURCHASE_NOT_FOUND', 404);
    const result = await this.pool.query(`SELECT a.stripe_session_id, a.payment_failed, p.status AS payment_status, l.id AS license_id, l.state, l.key_ciphertext FROM forma_mac_checkout_attempts a LEFT JOIN forma_mac_payments p ON p.attempt_id=a.id LEFT JOIN forma_mac_licenses l ON l.payment_id=p.id WHERE a.id=$1 AND a.cookie_hash=$2 AND a.expires_at>now()`, [id, secretHash(cookie, this.pepper)]);
    const row = result.rows[0]; if (!row) throw new ServiceError('PURCHASE_NOT_FOUND', 404);
    if (row.payment_status && row.payment_status !== 'paid') return { status: 'unavailable' };
    if (row.payment_failed && !row.license_id) return { status: 'failed' };
    if (!row.license_id) return { status: 'pending' };
    if (row.payment_status !== 'paid' || row.state === 'revoked') return { status: 'unavailable' };
    return { status: row.state === 'activated' ? 'activated' : 'paid', licenseId: row.license_id, licenseKey: row.state === 'issued' && row.key_ciphertext ? decryptKey(row.key_ciphertext, this.deliveryKey) : null, download: this.release.ready ? this.release.installerUrl : null };
  }
  async challenge({ publicKey, hardwareHash }) {
    if (typeof publicKey !== 'string' || publicKey.length > 1024 || !protocol.hex(hardwareHash)) throw new ServiceError('INVALID_DEVICE');
    try { protocol.publicKeyHash(publicKey); } catch { throw new ServiceError('INVALID_DEVICE'); }
    const id = randomUUID(), nonce = randomBytes(32).toString('base64url');
    const result = await this.pool.query(`INSERT INTO forma_mac_activation_challenges(id,nonce,device_public_key,hardware_hash) VALUES($1,$2,$3,$4) RETURNING expires_at`, [id, nonce, publicKey, hardwareHash]);
    return { id, nonce, expiresAt: result.rows[0].expires_at };
  }
  async activate({ licenseKey, challengeId, publicKey, hardwareHash, signature }) {
    let normalized;
    try { normalized = protocol.normalizeLicenseKey(licenseKey); protocol.publicKeyHash(publicKey); } catch { throw new ServiceError('INVALID_KEY'); }
    if (!protocol.uuid(challengeId) || !protocol.hex(hardwareHash) || typeof signature !== 'string' || !/^[a-zA-Z0-9_-]{86}$/.test(signature)) throw new ServiceError('INVALID_CHALLENGE');
    return transaction(this.pool, async client => {
      const query = await client.query('SELECT * FROM forma_mac_activation_challenges WHERE id=$1 FOR UPDATE', [challengeId]);
      const challenge = query.rows[0];
      if (!challenge || challenge.device_public_key !== publicKey || challenge.hardware_hash !== hardwareHash) throw new ServiceError('INVALID_CHALLENGE');
      const message = protocol.activationMessage({ id: challenge.id, nonce: challenge.nonce, publicKey, hardwareHash, licenseKey: normalized });
      if (!verify(null, message, createPublicKey(publicKey), Buffer.from(signature, 'base64url'))) throw new ServiceError('INVALID_PROOF', 403);
      const licenseQuery = await client.query(`SELECT l.*,p.status AS payment_status FROM forma_mac_licenses l JOIN forma_mac_payments p ON p.id=l.payment_id WHERE l.key_hash=$1 FOR UPDATE OF l`, [keyHash(normalized, this.pepper)]);
      const license = licenseQuery.rows[0];
      if (!license || license.payment_status !== 'paid' || license.state === 'revoked') throw new ServiceError('INVALID_KEY');
      // An exact network retry can recover its original grant. A new submission cannot activate again.
      if (challenge.consumed_at) {
        if (challenge.license_id === license.id && license.state === 'activated' && license.activation_challenge_id === challenge.id && license.device_public_key === publicKey && license.hardware_hash === hardwareHash) return { license: license.signed_grant, recovered: true };
        throw new ServiceError('NONCE_USED', 409);
      }
      if (new Date(challenge.expires_at).getTime() <= Date.now()) throw new ServiceError('NONCE_EXPIRED', 409);
      if (license.state !== 'issued') throw new ServiceError('KEY_ALREADY_USED', 409);
      const activatedAt = new Date().toISOString();
      const grant = this.signGrant({ licenseId: license.id, activatedAt, deviceKeyHash: protocol.publicKeyHash(publicKey), hardwareHash });
      const updated = await client.query(`UPDATE forma_mac_licenses SET state='activated',device_public_key=$2,hardware_hash=$3,activation_challenge_id=$4,signed_grant=$5,activated_at=$6,key_ciphertext=NULL WHERE id=$1 AND state='issued' RETURNING id`, [license.id, publicKey, hardwareHash, challenge.id, grant, activatedAt]);
      if (!updated.rowCount) throw new ServiceError('KEY_ALREADY_USED', 409);
      await client.query('UPDATE forma_mac_activation_challenges SET consumed_at=now(),license_id=$2 WHERE id=$1', [challenge.id, license.id]);
      return { license: grant, recovered: false };
    });
  }
}
