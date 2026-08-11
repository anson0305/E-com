# E-commerce API

Express + TypeScript + PostgreSQL backend learning project. It includes JWT authentication, products, categories, carts, and a Stripe test-mode payment flow.

## Payment design

`POST /payments/checkout` reads the authenticated user's cart and opens a short PostgreSQL transaction. It locks the product rows in `product_id` order, checks all stock, decreases stock as a reservation, creates an `awaiting_payment` order with price snapshots, and clears the cart. If any product has run out, the transaction rolls back and returns `409`; no Stripe PaymentIntent is created.

The reservation lasts 15 minutes. A successful signed Stripe webhook changes the order to `paid`. A failed or cancelled payment releases reserved stock exactly once. Stripe webhook event IDs are unique in the database, so Stripe retries cannot duplicate state changes.

The transaction intentionally ends before the call to Stripe. Payment confirmation can take time (for example 3D Secure), and holding database row locks while waiting for it would block other checkouts.

## Local setup

Copy `.env.example` to `.env` and enter local database and Stripe **test** credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=e_comdb
DB_USER=postgres
DB_PASSWORD=your-password

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Never commit `.env`, `sk_test_...`, `sk_live_...`, or `whsec_...`. The `.gitignore` already excludes `.env` files.

Apply the payment migration once after the existing migrations:

```powershell
& "D:\Tool\Postgre\pgsql\bin\psql.exe" -U postgres -d e_comdb -f migrations\007_orders_payments.sql
```

Run the API:

```powershell
npx tsx watch src/server.ts
```

## Payment endpoints

All endpoints below, except the Stripe webhook, require `Authorization: Bearer <access-token>`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/payments/checkout` | Reserve cart stock and create/reuse a Stripe PaymentIntent. Optional `Idempotency-Key` header makes client retries safe. |
| `GET` | `/payments/orders/:id` | Read the authenticated user's order and item snapshots. |
| `POST` | `/payments/orders/:id/cancel` | Cancel a pending PaymentIntent and release stock. |
| `POST` | `/payments/maintenance/release-expired` | Admin-only cleanup for expired reservations. In production, invoke this from a scheduled job. |
| `POST` | `/payments/webhook` | Stripe-only raw-body webhook endpoint; it verifies `Stripe-Signature`. |

The checkout response includes a `client_secret`. Send it only to the frontend session that owns the order; do not log it or put it in a URL. The frontend later uses Stripe.js / Payment Element to confirm card payment, so card details never pass through this API.

## Testing a Stripe webhook locally

Install the [Stripe CLI](https://docs.stripe.com/stripe-cli), log in, then forward Stripe test events to the local API:

```powershell
stripe login
stripe listen --forward-to localhost:3000/payments/webhook
```

The CLI prints a webhook signing secret beginning with `whsec_`. Copy it into `STRIPE_WEBHOOK_SECRET` in `.env`, restart the API, then use Stripe's [test cards](https://docs.stripe.com/testing) through a frontend Payment Element. Stripe sends `payment_intent.succeeded` or `payment_intent.payment_failed` to the webhook endpoint.

## Verification

```powershell
npm run typecheck
npm test
npm run verify:payment-race
```

`verify:payment-race` uses the local PostgreSQL database to create two isolated test carts that compete for a product with stock `1`. It asserts exactly one checkout succeeds, then deletes only the test records it created.
