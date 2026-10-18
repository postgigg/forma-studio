import protocolConfig from '../../shared/mac-license.json' with { type: 'json' };
import macRelease from '../config/mac-release.json' with { type: 'json' };
import merchant from '../config/merchant.json' with { type: 'json' };
import { signer } from './crypto.mjs';
export { protocolConfig, macRelease };
export function loadConfig(env = process.env) {
  let signGrant;
  const deliveryKey = Buffer.from(env.FORMA_LICENSE_DELIVERY_KEY || '', 'base64');
  const pepper = env.FORMA_LICENSE_KEY_PEPPER || '';
  try { signGrant = signer(env.FORMA_LICENSE_SIGNING_KEY?.replaceAll('\\n', '\n'), protocolConfig); } catch {}
  const licenseReady = !!signGrant && deliveryKey.length === 32 && pepper.length >= 32;
  const stripeKey = env.STRIPE_SECRET_KEY || '';
  const providerReady = /^(?:sk|rk)_(live|test)_/.test(stripeKey) && !!env.STRIPE_WEBHOOK_SECRET && /^price_[a-zA-Z0-9]+$/.test(env.STRIPE_MAC_PRICE_ID || '');
  let releaseReady = false;
  try {
    const url = new URL(macRelease.installerUrl);
    releaseReady = macRelease.ready === true && macRelease.signedAndNotarized === true && /^\d+\.\d+\.\d+$/.test(macRelease.version) && /^[a-f0-9]{64}$/.test(macRelease.sha256) && url.origin === protocolConfig.apiOrigin && url.pathname.startsWith(`/downloads/v${macRelease.version}/`) && url.pathname.endsWith('.dmg') && !url.search && !url.hash;
  } catch {}
  const context = env.CONTEXT || 'production';
  const origin = context !== 'production' && env.DEPLOY_PRIME_URL ? new URL(env.DEPLOY_PRIME_URL).origin : protocolConfig.apiOrigin;
  const checkoutReady = env.MAC_CHECKOUT_ENABLED === '1' && licenseReady && providerReady && releaseReady && (context !== 'production' || /^(?:sk|rk)_live_/.test(stripeKey));
  return { origin, product: protocolConfig.product, accountId: merchant.stripeAccountId, pepper, deliveryKey, signGrant, licenseReady, providerReady, checkoutReady, stripeKey, webhookSecret: env.STRIPE_WEBHOOK_SECRET, priceId: env.STRIPE_MAC_PRICE_ID, release: { ...macRelease, ready: releaseReady } };
}
