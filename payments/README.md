# Forma Mac payment and activation service

Intent: sell Forma Studio for Mac for **$49 USD once**, issue one license per verified payment, and allow one successful activation on one Mac. Windows stays free. Designs and the AI worker run locally; payment and activation records use managed Stripe and Netlify services.

The implementation uses Stripe Node SDK 23.0.0 and hosted Checkout in payment mode, with one-time invoice creation. It does not create a recurring subscription. The server reads the amount from `config/product.json` and checks the configured Stripe Price and paid Checkout line items against it. Card details never pass through Forma. Checkout paid invoices have separate pricing and require customer email settings for automatic delivery; review [Stripe's invoice receipt guidance](https://docs.stripe.com/receipts) before enabling live payments.

The Stripe plugin was already installed in Claude, its MCP endpoint was configured, and its health check required authentication. OAuth timed out before completion, so the implementation planner was unavailable. The requested `npx skills add https://docs.stripe.com` fallback installed Stripe's official skills; this review follows the payments, billing and security references. A planner-generated review and a real Stripe sandbox transaction remain pending authentication. No API key pasted into chat was stored in source or deployed.

## Payment and license flow

1. A same-origin checkout request sets a random HttpOnly, Secure, SameSite cookie tied to a server-created purchase attempt. The service verifies the pinned merchant account and a $49 one-time USD Price before creating hosted Checkout. It requires a verified Mac release before accepting purchases.
2. The webhook verifies Stripe's signature over the raw body. It retrieves the Checkout Session and confirms payment status, exact product and Price, quantity, currency and amount, and successful payment without a refund or dispute. Both immediate and delayed payment success are supported; failed delayed payments never issue a key.
3. A database transaction records the Stripe event and payment and issues one random 160-bit license key. Unique constraints and a per-payment lock make duplicate and concurrent webhook deliveries safe. Keys are HMAC hashed for lookup and encrypted for initial delivery. The success URL alone never authorizes a key.
4. The original browser can retrieve its unused key for seven days. The purchase page tells the buyer to save it before leaving. Lost keys or purchases opened in a different browser require a verified support recovery process; there is no unauthenticated email lookup.
5. The Mac client generates an Ed25519 device key protected by Electron safeStorage and the Mac keychain. It hashes the platform UUID before sending it; raw hardware identifiers stay off the server. A five-minute nonce requires a signature from the device key.
6. Activation locks the challenge and license, checks payment eligibility, and atomically changes the key from issued to activated. A new activation with the same key returns `KEY_ALREADY_USED`. An exact retry of the original signed request can recover the original grant if its response was lost, without consuming a second activation.
7. The app verifies the server-signed grant against its bundled public issuer and device identity. The grant supports offline editing. Copying the profile to another device identity fails. The encrypted pending request survives a crash or lost network response.

Refunds and disputes block unused keys and mark existing entitlements revoked in the database. A previously activated offline app does **not** receive instant remote revocation. This is a perpetual local license, not a claim of unbreakable DRM. Keychain behavior, hardware identity and code signing must be tested on an actual Mac before release.

## Deployment and required configuration

The root `netlify.toml` uses this directory as its build base, bundles `netlify/functions/mac-api.mjs`, and publishes only `../website`. Installing the database SDK enables [Netlify Database provisioning](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/). SQL migrations are additive and live in `netlify/database/migrations`; [Netlify applies them before publishing](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/).

Keep these variables in Netlify's **secret functions scope**, using separate production and sandbox credentials. Prefer a restricted Stripe key with only the permissions needed for account and Price reads, Checkout creation/reads, payment and charge reads, and invoice creation. Never place a secret key in the desktop app, website files, Git or command-line arguments.

| Setting | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Restricted or secret server key for the selected Stripe environment |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/mac/webhook` in the same environment |
| `STRIPE_MAC_PRICE_ID` | Active USD one-time Price for 4900 cents |
| `FORMA_LICENSE_SIGNING_KEY` | Ed25519 private PEM matching the bundled current issuer |
| `FORMA_LICENSE_KEY_PEPPER` | At least 32 bytes of random secret for key and request hashing |
| `FORMA_LICENSE_DELIVERY_KEY` | Base64 encoded 32-byte AES key for purchase delivery |
| `MAC_CHECKOUT_ENABLED` | `0` until all release and merchant checks pass; `1` explicitly opens purchasing |

`shared/mac-license.json` contains public verification keys only. Production is pinned to the merchant account in `config/merchant.json`; another account cannot issue Forma keys. Confirm the account through authenticated Stripe access before changing that pin. Do not copy production signing secrets to untrusted previews or a sandbox test harness.

Register these verified webhook events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, and `charge.dispute.created`. Provision a separate Stripe sandbox for development and keep test grants out of production. Do not treat a local mocked payment as evidence that live Stripe is configured.

Before opening checkout, build and test on a Mac, sign and notarize the installer, verify its SHA-256 and public download, and populate `config/mac-release.json`. It currently has `ready: false`. The public status endpoint reports `available: false` and checkout returns 503 while any required setting is absent. Production also rejects test-mode keys for purchasing. The release file's signed/notarized flag must reflect actual Apple verification, not a manual assumption.

For tax, review registrations and the applicable setup before launch. Automatic tax is not enabled by this implementation; enabling a flag alone does not establish a registration. See [Stripe tax setup](https://docs.stripe.com/tax/set-up). The purchase price and tax treatment must be reviewed for the selling business before accepting live payments.

Routine maintenance should retain payment records, back up the public issuer configuration and secret settings, and remove expired unused activation challenges and old rate-limit buckets. Preserve consumed nonces that support lost-response recovery. Rotate issuer keys by adding a new public issuer while retaining prior public keys needed for existing grants.

## Validation

Run `npm ci` in this directory. Use a dedicated local PostgreSQL database named `forma_license_test` on loopback port 55435, then `npm test`. The test harness refuses a remote database or another database name and creates an isolated schema per case. It covers webhook replay and signature validation, wrong merchant and amount, unpaid and refunded purchases, cookie ownership, concurrent activation, nonce expiry and forgery, transaction rollback, offline signature verification, and encrypted restart recovery. It does not charge a real card or create a production license.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe webhook security](https://docs.stripe.com/webhooks), [one-time Checkout invoices](https://docs.stripe.com/payments/checkout/post-payment-invoices), and [Stripe secret management](https://docs.stripe.com/keys-best-practices).
