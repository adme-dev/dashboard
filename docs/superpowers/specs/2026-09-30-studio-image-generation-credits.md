# Studio image generation and customer credits

Status: implementation approved 30 September 2026, after completion of the CMS
staging goal. Internal credit accounting is implemented and tested; generation,
customer UI and payments remain in progress and are not enabled for customers.
No payment account, checkout product or charge created. See the
[implementation plan](../plans/2026-09-30-studio-images-credits.md).

## Product outcome

A site editor can generate a hero image or section background, choose an AI
model, see the credit cost before confirming, preview the result and save it to
the website's media library. Selecting Use image updates the draft through the
normal checkpoint flow; publishing retains the existing review and permissions.
This belongs in the standalone Studio experience as well as agency entry.

Proposed interface:

1. Generate image in the hero/background asset picker and media library.
2. Prompt, optional brand guidance, supported aspect ratio and a short model
   list showing actual model names, quality/speed guidance and quoted credits.
3. Balance and Generate for N credits action, or a clear Top up path when short.
4. Recoverable progress, preview, crop/focal point and Use image. Generating a
   fresh variant clearly incurs a new quoted charge; applying a saved asset does
   not charge again. Decorative backgrounds can have empty alt text; meaningful
   images support editable alt text.
5. Studio account page for balance, top-ups and generation history, accessible
   only to the appropriate billing/owner role. Editors can see their permitted
   balance and generation costs without gaining payment administration access.

## Billing decision proposed

Use application-owned Studio AI credits purchased through payment checkout.
Keep these distinct from the upstream Cloudflare account balance.

Cloudflare's documented Unified Billing loads credits into a Cloudflare account.
The reviewed documentation does not describe merchant checkout or separate
customer wallets inside our account. Its account auto-top-up can replenish our
upstream pool; it does not credit a customer's Studio balance. Provider keys or
default BYOK credentials may take precedence over Unified Billing, so verify the
chosen credential/billing route for each admitted model. [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)

Recommended initial wallet scope: one customer account within a tenant, shared
across its websites, with site/actor attribution on every debit. This is the implementation
default under the approved design; it does not change native permissions.
Use integer credit units and versioned prices; do not use floating-point money.

Recommended checkout: Stripe Checkout for one-time credit packs, with a native
ledger granting credits exactly once after verified payment settlement. A
success redirect alone must never grant credits. Stripe Billing credit grants
are an alternative if metered subscription billing is adopted; they apply to
metered invoices and are not a replacement for immediate generation reservations.
[Billing credits](https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits)

Cloudflare supports spend limits keyed by customer metadata, but the documented
limits are eventually consistent and recorded after completion. Use these as
additional upstream protection, with server-generated scope metadata. Atomic
application reservations enforce each customer's available balance even under
concurrent requests. [Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/)

## Architecture and reuse

- Dashboard owns authenticated quotes, payment fulfillment, wallet ledger,
  permissions, generation jobs and site asset ownership. Studio owns editor
  controls and draft application through existing capabilities.
- Route every admitted model through the explicitly configured Cloudflare AI
  Gateway. Use a curated server model registry and model-specific adapters;
  verify image capability, availability, input schema, price and credential lane
  before enabling each model. The catalog and REST API support image models;
  catalog presence alone is not evidence of successful account integration.
  [Models](https://developers.cloudflare.com/ai/models/),
  [REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- Existing `server/utils/creative-generation/modelRegistry.ts` and
  `aiGatewayProvider.ts` provide registry/adapter patterns. The current Banner
  Studio endpoint already calls that adapter and saves R2 assets. Its current
  text-to-image and approved-source upscale policies must remain intact,
  including restrictions on generated vehicle imagery.
- Do not directly expose the agency endpoint to customers: add native
  tenant/customer/site authorization, persistent concurrency control and billing.
  Review explicit gateway selection, output download bounds and redirect/address
  validation before sharing the adapter. Its existing process-local concurrency
  counter is not a distributed wallet or job reservation.
- Existing CMS AI request/reservation recovery and asynchronous generation job
  patterns are useful precedents. Existing quotas/invocation records are not
  prepaid payment balances. Legacy direct-provider image helpers do not satisfy
  the requested Gateway routing requirement.
- Persist validated outputs in owned R2 media storage with model, prompt policy,
  job and price-version provenance. Provider URLs are transient, not permanent
  website asset references. Enforce size/type/dimension limits and safe downloads
  including redirects, IPv6/private addresses and DNS resolution checks.

## Required invariants

- A quote binds scope, model, parameters, output count, credits, price version
  and expiry. The server computes it; the client cannot set prices or provider
  endpoints. No silently more expensive fallback after confirmation.
- A unique generation intent atomically reserves credits before dispatch. One
  reservation can settle at most once. Known failure releases it; uncertain
  provider outcome enters reconciliation before retry or refund. A closed tab,
  duplicate callback or poll cannot create another provider call or debit.
- Proposed customer charging policy: settle after a usable asset has been saved,
  even if the customer chooses not to apply it; release on a confirmed failure.
  Explain this before generation. Platform absorbs provider charges for unusable
  outputs under that policy; account for this in pricing.
- A verified payment webhook checks event identity, paid/settled state, amount,
  currency, pack version and server-bound customer ownership before posting one
  immutable credit entry. Duplicate/out-of-order events cannot mint credits.
  Refunds/disputes use explicit compensating entries and account restrictions
  where required; never erase transaction history.
- Scope every job, asset, ledger read and callback. View-only actors cannot
  generate or change content. A customer cannot spend another customer's balance
  or enumerate their assets. Billing roles remain separate from edit roles.
- Provider tokens remain server-side. Redact sensitive logging, set retention
  deliberately and preserve applicable creative-source/content rules. Bound
  retries, per-customer concurrency and platform exposure independently.

## Ordered implementation tasks

- [ ] Confirm wallet ownership, initial curated models and commercial choices
  below; define API contracts and migrations with ledger/job invariants.
- [ ] Implement scoped ledger, quote, reserve/settle/release and reconciliation;
  prove concurrent overspend prevention and recovery with synthetic credits.
- [ ] Add model adapters through a named Gateway, asynchronous execution where
  needed, validated R2 storage and usage/cost attribution. Verify against a
  staging account with bounded model spend.
- [ ] Add customer generation controls, model/cost selection, progress, media
  library and hero/background draft integration. Use Nuxt UI for Dashboard
  surfaces and the Studio editor's existing component system for its overlay.
  Verify desktop/mobile, keyboard, recovery and independent Studio entry.
- [ ] Add Stripe test-mode packs/checkout and verified fulfillment, balance and
  history. Test duplicate webhooks, delayed/failed settlement, wrong scope,
  replay, refunds/disputes and no credit on success redirect alone.
- [ ] Run two-customer isolation and permission acceptance, concurrent generation,
  provider timeout/reconciliation, failed download, quoted cost and no-auto-publish
  checks. Review pricing and support receipts before enabling live payment mode.
- [ ] Update relevant public feature pages/navigation once the feature is
  implemented and available; do not advertise this proposal as shipped.

Commercial choices before live payment: currency (AUD is a reasonable starting
point), pack amounts, model prices/margin, expiry/refund treatment and which role
can purchase. Include Gateway/provider fees, payment fees, storage and failed-job
costs when setting prices. Automatic customer top-ups are a later explicit opt-in.
Neither live payments nor a customer production rollout is implied by this plan.

## Implementation evidence — accounting foundation

Migration 438 adds environment-separated customer wallets, reservation identities
and an immutable credit journal. Internal transaction-only functions reserve,
settle, release and deduplicate grants; no browser route exposes a grant or
settlement operation. Eleven real PostgreSQL tests cover cross-site concurrent
overspend, replay identity, terminal state conflicts, scope/environment isolation,
rollback, invalid amounts and frozen spending. The focused regression run passes
23 tests; ESLint passes for both new TypeScript files. The migration was applied
automatically to isolated CMS staging, with all three tables empty. This is not
evidence of payment fulfillment or hosted model integration.
