import { getDatabase } from '@netlify/database';
import Stripe from 'stripe';
import { loadConfig } from '../../lib/config.mjs';
import { LicenseService } from '../../lib/licenses.mjs';
import { createApi } from '../../lib/http.mjs';
const settings = loadConfig();
const stripe = settings.providerReady ? new Stripe(settings.stripeKey, { maxNetworkRetries: 2, timeout: 15000 }) : null;
let service;
function getService() {
  service ||= new LicenseService({ ...settings, pool: getDatabase().pool, stripe });
  return service;
}
export default createApi({ config: settings, getService, stripe });
export const config = { path: '/api/mac/*' };
