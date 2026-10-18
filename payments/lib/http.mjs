import { ServiceError } from './licenses.mjs';
import priceSpec from '../config/product.json' with { type: 'json' };
const headers = {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
};
const cookieName = id => '__Host-forma_mac_' + id;
const messages = {
  INVALID_KEY: 'That key could not be verified. Check it and try again.',
  KEY_ALREADY_USED: 'This key has already been used. Purchase a new key for this Mac.',
  INVALID_DEVICE: 'This Mac could not be verified. Please try again.',
  INVALID_CHALLENGE: 'Start activation again on this Mac.', INVALID_PROOF: 'This activation could not be verified.',
  NONCE_USED: 'This activation request has already been used.', NONCE_EXPIRED: 'The activation request expired. Please try again.',
  PURCHASE_NOT_FOUND: 'Open the purchase in the browser you used to pay.', RATE_LIMITED: 'Too many attempts. Please try again in a few minutes.',
  CHECKOUT_UNAVAILABLE: 'Mac purchasing is not available yet.', LICENSE_UNAVAILABLE: 'Activation is temporarily unavailable. Please try again later.',
  PAYMENT_NOT_ELIGIBLE: 'This payment could not be confirmed.',
};
function json(value, status = 200, extra = {}) { return new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } }); }
async function body(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw new ServiceError('INVALID_REQUEST', 413);
  let size = 0; const chunks = [];
  for await (const chunk of request.body || []) { size += chunk.byteLength; if (size > limit) throw new ServiceError('INVALID_REQUEST', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function cookieValue(request, id) {
  const name = cookieName(id);
  return (request.headers.get('cookie') || '').split(';').map(c => c.trim()).find(c => c.startsWith(name + '='))?.slice(name.length + 1) || '';
}
export function createApi({ config, getService, stripe }) {
  return async (request, context = {}) => {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/mac/status' && request.method === 'GET') return json({ available: config.checkoutReady, price: priceSpec, download: config.release.ready ? config.release.installerUrl : null });
      if (!['/api/mac/checkout', '/api/mac/receipt', '/api/mac/challenge', '/api/mac/activate', '/api/mac/webhook'].includes(path)) return json({ error: 'NOT_FOUND' }, 404);
      if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
      if (path === '/api/mac/webhook') {
        if (!config.licenseReady || !config.providerReady) throw new ServiceError('LICENSE_UNAVAILABLE', 503);
        let event;
        const raw = await body(request, 262144);
        try { event = stripe.webhooks.constructEvent(raw, request.headers.get('stripe-signature'), config.webhookSecret); }
        catch { return json({ error: 'INVALID_WEBHOOK' }, 400); }
        await getService().fulfill(event);
        return json({ received: true });
      }
      const origin = request.headers.get('origin');
      if (origin && origin !== config.origin) return json({ error: 'UNTRUSTED_ORIGIN' }, 403);
      if (['/api/mac/checkout', '/api/mac/receipt'].includes(path) && origin !== config.origin) return json({ error: 'UNTRUSTED_ORIGIN' }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'INVALID_REQUEST' }, 415);
      if (path === '/api/mac/checkout' && !config.checkoutReady) throw new ServiceError('CHECKOUT_UNAVAILABLE', 503);
      if (!config.licenseReady) throw new ServiceError('LICENSE_UNAVAILABLE', 503);
      let value;
      try { value = JSON.parse((await body(request, 8192)).toString('utf8')); }
      catch (error) { if (error instanceof ServiceError) throw error; return json({ error: 'INVALID_REQUEST' }, 400); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'INVALID_REQUEST' }, 400);
      const service = getService();
      await service.rateLimit(context.ip || 'unknown', path.slice(9), path.endsWith('/receipt') ? 120 : path.endsWith('/checkout') ? 8 : 30);
      if (path === '/api/mac/checkout') {
        // Confirm the verified release remains downloadable before accepting a purchase.
        const download = await fetch(config.release.installerUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
        if (!download.ok) throw new ServiceError('CHECKOUT_UNAVAILABLE', 503);
        const session = await service.createCheckout();
        return json({ id: session.id, url: session.url }, 200, { 'Set-Cookie': `${cookieName(session.id)}=${session.cookie}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800` });
      }
      if (path === '/api/mac/receipt') return json(await service.receipt(value.attemptId, cookieValue(request, value.attemptId)));
      if (path === '/api/mac/challenge') return json(await service.challenge(value));
      return json(await service.activate(value));
    } catch (error) {
      if (error instanceof ServiceError) return json({ error: error.code, message: messages[error.code] || 'This request could not be completed.' }, error.status, error.status === 429 ? { 'Retry-After': '900' } : {});
      return json({ error: 'SERVICE_UNAVAILABLE', message: 'We could not finish that request. Please try again.' }, 503, { 'Retry-After': '30' });
    }
  };
}
