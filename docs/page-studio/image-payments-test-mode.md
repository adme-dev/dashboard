# Image credit payments: test-mode implementation

Status, 30 September 2026: test-only checkout, accounting, provider verification,
webhook, native billing authority and customer top-up/receipt UI are implemented
on the feature branch. No Stripe keys or payment account have been configured or
activated for this feature. This document is not evidence of a successful hosted
payment. No live payments are admitted.

## Boundaries

- A private Cloudflare Worker runs Stripe SDK 22.6.2 using its Fetch client and asynchronous SubtleCrypto signature
  verification, API version `2026-08-26.dahlia`, with automatic retries disabled.
- `POST /api/webhooks/studio-image-payments` accepts at most 262,144 observed bytes
  and verifies the exact raw body before database or provider access. It rejects
  live and connected-account events. Error responses omit provider payloads.
- Provider notifications cause a fresh read of the Checkout Session,
  PaymentIntent, charge, refund list and any dispute. Current account identity,
  customer, native purchase metadata, amount and currency must agree.
- A billing owner is a current native client admin with access to the site.
  Viewer membership and disabled model allowance do not remove that billing
  role. An editor or agency edit permission does not grant it. Billing mutations
  reuse native login, entitlement, membership and role locks and final checks.

## Configuration (not populated)

`PAGE_STUDIO_IMAGE_PAYMENTS_SERVICE` is a preview-only service binding to
`xeroflow-page-studio-payments-staging`. That Worker has no public route,
workers.dev or preview URL, database binding, ledger access or request logging.
Its closed RPC operations validate bounded request bodies and accept test keys
only. Pages sends server-held test configuration over this private binding; no
browser supplies credentials. Keeping the SDK outside Pages preserves the fixed
Pages bundle budget. The native application retains every customer/role check,
persisted purchase, provider-identity comparison and transactional credit grant.

`PAGE_STUDIO_IMAGE_PAYMENTS` is server-only JSON containing `mode:"test"`, an
`accountId`, a canonical HTTPS application `origin`, explicit staging customer
`scopes`, and versioned `packs` with `{id,version,currency,amountMinor,credits}`.
This release supports AUD packs. No commercial default price is supplied.

`PAGE_STUDIO_IMAGE_STRIPE_SECRET` must be a test secret key;
`PAGE_STUDIO_IMAGE_STRIPE_WEBHOOK_SECRET` is the endpoint signing secret. Set
these through secret management, never in client code or documentation. Keep
settlement configuration available while any purchase can receive a delayed
payment, refund or dispute event. Removing configuration returns an error to
Stripe rather than acknowledging unprocessed money.

## Accounting and recovery

Migration 441 adds native purchase, provider-event and refund-identity tables.
It has been applied only to the existing isolated staging database, with zero
purchases as of the migration receipt. The customer wallet is locked before the
purchase. Provider network calls occur outside the transaction; accounting does not retry a transaction.

Checkout persistence does not grant credits. Verified paid state grants once,
deduplicated by event and payment identity. Journal entries and provider-event
evidence are immutable. Purchase scope, pack and bound provider identities cannot
be changed later.

Refunds arriving before payment confirmation are retained. Pending refunds hold
their value; failed/cancelled refunds reinstate that value once. Stale events
cannot reverse those terminal refund outcomes. The gross refund total is
monotonic, with failed/cancelled identities recorded separately. Partial refunds
convert to credits with exact integer arithmetic, rounding the debit up to the
next credit. Refund/dispute overlap cannot debit more than the purchased pack.

Active/lost disputes hold the purchase's credit value. A won dispute restores
eligible credits after accounting for refunds. A late active-dispute event cannot
undo a recorded terminal result. Conflicting terminal dispute evidence requires
operator reconciliation. Current provider reads are bounded to one dispute and
100 refunds per purchase; incomplete lists fail closed and require review.

Reversals can create credit debt without deleting generation history. Spending
freezes when disputed or when balance falls below existing reservations. Freezes
are deliberately sticky: reinstatement does not silently clear another account
restriction. Before clearing a freeze, an operator must reconcile every active
dispute, credit debt and reservation, and retain the supporting receipt. The
final release runbook must provide that controlled operator procedure.

## Verification and remaining work

Tests cover forged/expired signatures, raw-body preservation, event replay,
concurrent settlement, wrong customer/amount/currency/environment, immutable
purchase identity, refund-before-funding, partial/failed/cancelled refunds,
overlapping disputes, debt and transaction rollback. Native authority tests
include a viewer who is a billing owner and revoked-role rollback. Provider
retrieval tests use synthetic SDK responses; PostgreSQL accounting tests use the
owned local disposable database.

The customer flow lives at `/studio/credits`, independently of agency operations.
Native portal endpoints under `/api/portal/page-studio/sites/:siteId/images` are
`billing` (available server packs and latest 20 purchase summaries), `checkout`
(POST), and `receipt` (GET). Receipts remain readable with checkout disabled.
Only a current customer billing owner can read purchase receipts or buy credits.

A purchase saves its pack, price, currency, origin and actor before any provider
call. Each SQL step rechecks native billing authority, including after provider
responses. Customer identity is bound before checkout. Stripe idempotency keys
are based on the immutable native intent; the same intent never changes price or
return URL when server configuration changes. Retry uses the saved version.
Provider mutations are allowed only in the first 25 minutes, and Checkout expires
one hour after native intent creation. Older unknown requests require payment
review; they are not silently recreated after Stripe's idempotency retention.

The UI stores only an opaque intent and pack identifiers for same-tab recovery.
It distinguishes available credits, reserved credits, test checkout, cancelled
return and payment awaiting confirmation. Returning from checkout never grants
credits. A delayed response cannot navigate after switching websites. Starting
another purchase is an explicit action after confirmation or the one-hour window;
a delayed payment may still settle, which the UI explains. Failed status checks
hide the old receipt and never clear a pending purchase.

Verification includes a real Stripe SDK signed event through the provider-state
adapter into the disposable PostgreSQL ledger, with concurrent replay producing
exactly 100 credits. Provider responses in this test are synthetic. The real NuxtUI
browser harness checks dark/light desktop/mobile layout, stable retry identity,
pending/confirmed receipts and access failures. Hosted Stripe acceptance remains
unverified until test credentials and versioned pack pricing are supplied through
secret management. Never enter real card details into a staging test checkout.

Official references: [Checkout creation](https://docs.stripe.com/api/checkout/sessions/create),
[idempotent requests](https://docs.stripe.com/api/idempotent_requests),
[Stripe webhooks](https://docs.stripe.com/webhooks.md),
[refund lifecycle](https://docs.stripe.com/refunds.md),
[charge object](https://docs.stripe.com/api/charges/object),
[dispute object](https://docs.stripe.com/api/disputes/object), and
[Cloudflare's Stripe SDK integration](https://blog.cloudflare.com/announcing-stripe-support-in-workers/).
