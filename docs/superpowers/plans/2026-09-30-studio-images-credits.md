# Studio images and credits implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Customers generate owned website images through a named AI Gateway, select models and knowingly spend prepaid credits, with recoverable jobs and Stripe test-mode top-ups.

**Architecture:** Dashboard owns native authorization, PostgreSQL wallets, quotes, jobs and payment settlement. A private Studio image worker consumes durable queue messages, claims each job once, calls the named Gateway and stores validated images in the existing scoped checkpoint R2 asset namespace. The editor applies those assets through ordinary typed draft operations. Payment redirects never grant credit.

**Tech Stack:** Nuxt 4 / Nuxt UI v4, TypeScript, Zod, PostgreSQL, Cloudflare Workers AI / AI Gateway / Queues / R2, Stripe Checkout, Vitest and real PostgreSQL integration tests.

**Spec:** `docs/superpowers/specs/2026-09-30-studio-image-generation-credits.md` (approved by the user's implementation request).

## Global constraints

- Worktrees: Dashboard `/private/tmp/dashboard-cms-current-main-20260928`; Studio `/private/tmp/studio-cms-current-main-20260928`. Both now use `feat/studio-ai-images-20260930` from freshly fetched main plus the verified, unmerged CMS dependency. CMS PRs remain unchanged.
- Baselines: Dashboard `9a5012dd16ca8131b8e7f8819b0817f0d7449da6`; Studio `a188c25693489cea8d91b38dac122bc3ed3c75fe`. Exact-head CI is green in both repositories, including Linux and Windows Studio verification.
- Node 24.18.0; Studio pinned pnpm 11.9.0. Export the known Node/pnpm PATH before commands.
- Wallet scope is tenant + customer + environment, shared across that customer's sites. Integer credits only, immutable journal, serialized reservations. Production and staging never share balances.
- Use test-mode packs from explicit configuration. No invented live prices, live Stripe payments, automatic top-ups, merges or customer production activation. Missing payment configuration must produce a useful unavailable state, not a fake successful checkout.
- Derive scopes and roles from native authentication/session claims. Revalidate current authority inside the mutation transaction; never trust client-supplied prices, URLs, billing customer IDs or scope.
- Settle only after a usable owned asset is durable. Confirmed failure releases; ambiguous dispatch remains reserved for reconciliation. A replay never starts another model call.
- Provider adapter accepts only curated models, one output, bounded input/output, explicit named Gateway and no fallback/retries. Keep existing restrictions on generated vehicle imagery.
- Hero/background/image application uses saved draft/checkpoint/undo and does not publish. Existing immutable publication copies assets from scoped `preview-assets` into release inventory.
- Dashboard forms use Nuxt UI and UFormField. Studio overlay uses its existing controls and focus conventions. Load the required frontend-design skill before editing forms.
- Run additive migrations automatically against the authorized isolated staging database and a disposable local schema; never silently use the application's production `.env` for this task.

## Review focus

1. A payment reversal arriving before a delayed paid event must not mint spendable credits; Task 5 pins this order.
2. A customer closes the editor after dispatch or after R2 persistence: Task 3 proves a reconnect neither regenerates nor loses settlement recovery.
3. Two editors spend the same last credits across different sites: Task 1 uses separate real PostgreSQL connections and asserts one reservation.
4. An editor loses membership while waiting on a wallet lock: Task 2 rechecks current authority after acquiring locks and rolls back.
5. Applying an old asset after changing page/selection must never mutate the wrong component: Task 4 binds the target at confirmation and verifies typed operation validation.

### Task 1: Atomic wallet and reservation journal

**Files:** Create `server/database/migrations/438_page_studio_image_credits.sql`, `server/utils/pageStudio/imageCredits.ts`, `test/server/utils/pageStudioImageCreditsPostgres.test.ts`.

**Interfaces:** `CreditScope = {tenantId, clientId, environment}`. Internal transaction-only functions `grantImageCredits(db, scope, {entryId, credits, fingerprint})`, `reserveImageCredits(db, scope, {reservationId, siteId, actorId, actorRole, credits, fingerprint})`, `finishImageCredits(db, scope, reservationId, outcome)` and `readImageCredits(db, scope)`. Outcomes are `settled` or `released`; terminal states never change. These are trusted accounting primitives, not HTTP endpoints. Caller supplies a non-retrying SQL transaction and current authorization.

- [x] Write real PostgreSQL tests with a random disposable schema, minimal customer/site parent rows, and the real migration. Prove 100 credited minus a 70 reservation leaves 30 available; duplicate reservation preserves 30; changed fingerprint conflicts; settlement leaves balance30/reserved0 and one debit; release returns availability100; opposite terminal transition conflicts; no cross-customer/environment read or mutation. Prove simultaneous70-credit reservations yield one success and one insufficient-credit failure using independent connections.

```ts
const outcomes = await Promise.allSettled([reserve('first', 70), reserve('second', 70)])
expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
expect(await balance()).toMatchObject({ balance: 100, reserved: 70, available: 30 })
```

- [x] Run `PAGE_STUDIO_IMAGE_DATABASE_TEST_URL=postgresql://localhost:55461/studio_cms_receipt pnpm exec vitest run test/server/utils/pageStudioImageCreditsPostgres.test.ts`. Expected RED: accounting module/migration absent; then implement and rerun until all behavioral tests pass.
- [x] Implement wallet row locks, bounded integer inputs, immutable journal and unique reservation identities. Acquire wallet once before reading or changing reservations. Reject identity reuse across site, actor, amount or fingerprint. Use `ON CONFLICT DO NOTHING` only for wallet initialization; explicitly compare replay identities.
- [x] Apply migration to isolated staging using its private connection file, check expected schema, review all changed files and commit `feat(studio): add atomic image credit ledger`.

### Task 2: Authorized quotes and customer account API

**Files:** Create `shared/pageStudio/imageGeneration.ts`, `server/utils/pageStudio/imageGenerationAuthority.ts`, `server/utils/pageStudio/imageQuotes.ts`, `server/api/portal/page-studio/sites/[siteId]/images/{catalog.get,quote.post,account.get}.ts`, equivalent agency endpoints, and `test/server/utils/pageStudioImageAuthorityPostgres.test.ts` / `pageStudioImageQuotes.test.ts`.

**Interfaces:** Quotes contain opaque UUID, exact model ID, supported dimensions, prompt digest, credits, priceVersion and expiry. Native customer accounting primitives from Task 1 are called only after current site/login authority under site-then-wallet lock ordering. Browser requests carry prompt/model/aspect/intent only. Task 3 adds editor signed-session routes using the same validated quote/job contracts.

- [x] Write failing tests: forged scope/price/unknown model rejected, expired quote rejected, quote replay with changed prompt conflicts, viewer denied, wrong customer404, entitlement/logout revocation while lock waits rolls back, billing-role denial independent of editor authority.
- [x] Define closed Zod request and receipt schemas, bounded prompt2048/output1, explicit price version. Model adapters initially admit documented `@cf/black-forest-labs/flux-1-schnell` and `@cf/stabilityai/stable-diffusion-xl-base-1.0` only when configured and staging verified. FLUX currently documents no width/height parameters: expose its native ratio honestly; SDXL offers bounded supported dimensions. Model prices come from server configuration, not provider catalog marketing numbers.
- [x] Compose existing native login/session checks without weakening freshness; store quotes durably; Task 3 atomically stores job intents and credit reservations before queue delivery. Expose catalog/balance/history only in authorized scope, redact prompt from billing rows, and cap pagination.
- [x] Run both new suites plus existing native authority suites; expected PASS including concurrent revocation. Commit `feat(studio): authorize image quotes and account history`.

### Task 3: Durable generation, named Gateway and owned assets

**Files:** Dashboard `server/utils/pageStudio/imageJobs.ts`, `server/routes/internal/page-studio/images/*.post.ts`, `workers/page-studio-control/src/index.ts`; Studio `services/image-worker/{src/index.ts,src/provider.ts,src/assets.ts,wrangler.jsonc,package.json,test/generation.test.ts}`, `services/control-client/src/image-generation.ts`, `services/sandbox-worker/src/index.ts`, `packages/protocol/src/image-generation.ts`, matching contract tests.

**Interfaces:** Closed commands `catalog`, `quote`, `generate`, `read`, `library`; private service commands `claim`, `complete`, `fail`, `reconcile`. Queue payload contains only opaque job ID and trusted scope reference; the native store supplies immutable quoted inputs. Claim is atomic and returns `admitted:false` on every replay, including unknown outcomes. Native job records retain dispatch and deterministic output receipt.

- [x] Write tests for duplicate/concurrent delivery, provider timeout, malformed/base64/oversized/image-dimension outputs, unauthorized callback, lost completion response, R2 save before DB failure, known rejection release and unknown outcome retention. Use a fake external AI binding and real state transitions; assert resulting bytes, reservations and journal entries.
- [x] Call `env.AI.run(model, inputs, {gateway:{id:configuredGateway,skipCache:true,metadata:serverMetadata}})` with an explicit nonempty gateway. No remote output URLs are accepted by these two adapters. Verify magic bytes, bounded decoded length/dimensions and SHA256 before writing `tenants/{tenant}/clients/{client}/sites/{site}/preview-assets/{sha}.{ext}`.
- [x] Add authorized native generate/job/library APIs and signed-editor quote/job adapters. Test revocation while waiting on the wallet lock.
- [x] Add transactional job outbox plus bounded scheduled resend of queued jobs. Queue duplicates cannot redispatch claimed jobs. Persist deterministic job-output receipt to R2 before native completion; reconciliation recovers saved assets, never guesses a provider failure. Unknown calls require operator reconciliation with immutable evidence.
- [x] Add strict same-origin Sandbox transport, capability/current native checks and bounded response parsing. Configure staging-only worker bindings and queue/dead-letter behavior; dry-run before deployment. Prove Gateway attribution and two admitted models with bounded synthetic spend before enabling their catalog entries.
- [x] Run worker/contract/security tests and commit `feat(studio): generate durable owned images through AI Gateway` in each affected repository.

### Task 4: Customer image picker and typed draft application

**Files:** Studio `packages/overlay/src/website/image-library-panel.ts`, `image-library-client.ts`, `component-panel.ts`, `packages/overlay/src/xeroflow-editor-workflow.ts`, applicable asset field inspector, overlay styles and browser tests; site-kit section/background schema/rendering if needed. Dashboard `app/pages/studio/credits.vue`, `app/layouts/studio.vue`, `app/components/page-studio/ImageCreditSummary.vue` and component tests.

**Interfaces:** The UI consumes Task 2/3 catalog/quote/job/asset receipts. `Use image` accepts a scoped owned asset plus captured page/component/field target and applies one validated `updateComponentProps` operation. Reopening recovers durable jobs and saved images; applying again costs no credits.

- [ ] Write browser tests showing prompt/model/aspect, quoted cost, balance, insufficient-credit path, recoverable progress, preview, explicit new-variant charge and saved-library reuse. Assert meaningful-image alt text, decorative empty-alt behavior, keyboard focus trap/return and mobile no overflow.
- [ ] Add existing-style controls and semantic product copy: `Generate for N credits`, explanation that credits are spent when an image is saved, `Use image`, and available balance. Preserve request identity on close/reopen. Changing prompt/model invalidates the displayed quote. Guard double-clicks and stale response ordering.
- [ ] Add background/focal position support only through typed schema/renderers; tests prove preview and immutable output agree. Preserve undo/checkpoints and approval invalidation; no publication call occurs.
- [ ] Run overlay and Dashboard component/browser tests, inspect actual desktop/mobile screenshots, review all files, then commit `feat(studio): add customer image generation and library controls`.

### Task 5: Test-mode credit checkout and verified payment lifecycle

**Files:** Dashboard `server/utils/pageStudio/imagePayments.ts`, `server/utils/pageStudio/imagePaymentConfig.ts`, `server/api/portal/page-studio/sites/[siteId]/images/checkout.post.ts`, `server/api/webhooks/studio-image-payments.post.ts`, `app/pages/studio/credits.vue`, payment schema migration, runtime configuration, package/lockfile and `test/server/utils/pageStudioImagePayments.test.ts` / PostgreSQL payment tests.

**Interfaces:** Server pack config `{id,version,currency,amountMinor,credits}`. A durable purchase intent binds customer/environment/pack/amount/currency before Stripe checkout. Stripe SDK verifies raw-body signature with configured webhook secret; paid event identity and exact intent values admit one journal grant. Refund/dispute events create immutable compensations and wallet restrictions.

- [ ] Write tests for no credit on redirect, forged signature, unpaid/async delayed settlement, wrong amount/currency/customer, duplicate events, different events for same payment, reversal before fulfillment, partial/repeated refunds, dispute after credits spent, and cross-environment events. Expected balance for duplicate100-credit settlement is100, not200.
- [ ] Use official Stripe SDK fetch/subtle crypto integration and provider idempotency keyed to persisted intent. Enforce `livemode:false`; live configuration fails closed for this release. Allowed success/cancel destinations come from configured application origin, never a request URL.
- [ ] Fulfill only verified paid state; deduplicate both event and payment identity. Aggregate cumulative refunds monotonically to prevent double compensation. Freeze spending on disputed/reversed insufficient balances without deleting history. Explicitly reconcile out-of-order events.
- [ ] Add owner/billing-only checkout, receipt/history, cancellation and pending settlement UI. Leave missing configuration visibly unavailable. Use Stripe test configuration if supplied through secret management; never request or print secrets in chat.
- [ ] Run signature, PostgreSQL replay/order/concurrency and UI tests; commit `feat(studio): add verified test-mode credit top-ups`.

### Task 6: Integration, public documentation and release evidence

**Files:** Both repositories' release/runbooks, Dashboard feature pages and navigation where relevant, this task checklist, paired new PR descriptions.

- [ ] Run two-customer acceptance across quote→reserve→Gateway→R2→preview→draft→review publication, wrong-scope/role denials, concurrent insufficient funds and closed-tab recovery. Verify existing CMS and QR navigation remain intact.
- [ ] Run required full Studio build/typecheck/tests/lint and Dashboard scoped tests/build, compare global typecheck against documented baseline, run deployment guards and staging dry-runs. Resolve new failures.
- [ ] Update marketing feature entry with 3–4 accurate sections and availability qualification; do not advertise live payments as enabled. Document wallet reconciliation, refunds, operator recovery, configured price version and model evidence.
- [ ] Perform the executing-plans skill's fresh whole-branch review, fix important findings with regression tests, then push separate reviewable PRs with explicit CMS dependency. Record exact source/main/deployment IDs and any unverified external Stripe setup. No merge or customer production deployment.
