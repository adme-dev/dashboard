# Decision Log

Decisions marked **Accepted** are rollout constraints. Decisions marked **Pending**
block only the phases listed.

## D-001 — Separate provider responsibilities

**Status:** Accepted
**Decision:** XeroFlow owns orchestration and approvals; Merchant API owns Merchant
resources; Google Ads API owns campaigns and advertising resources.
**Reason:** The APIs have different resource models, permissions and failure domains.
Conflating them would make authorization and recovery unsafe.

## D-002 — The AI assistant is internal

**Status:** Accepted
**Decision:** The assistant creates proposals and confirmed XeroFlow jobs/tasks. It is
not published to Google and receives no direct provider-mutation tools.
**Reason:** Deterministic validation and human authorization must remain between model
output and provider operations.

## D-003 — Merchant integration starts read-only

**Status:** Accepted
**Decision:** Releases 1-2 contain no Merchant mutation path.
**Reason:** Account topology, real enum behavior, feed ownership and operational impact
must be proven first.

## D-004 — Campaign creation is paused-first

**Status:** Accepted
**Decision:** Google campaigns are created paused, read back, then activated only by a
separate approved action.
**Reason:** Provider acceptance does not prove configuration correctness or authorize
spend.

## D-005 — Cloudflare remains the control plane

**Status:** Accepted
**Decision:** Use Pages/Nitro, Workers, Queues and existing Neon/R2 patterns. Do not add
Google Cloud compute, scheduler or messaging products for this rollout.
**Reason:** It preserves the deployed architecture and avoids a second operations plane.

## D-006 — Adopt, do not duplicate, concurrent PMax work

**Status:** Accepted
**Decision:** This workstream will rebase after the concurrent PMax session and reuse
its surviving budget, state, hash, approval and persistence contracts.
**Reason:** Root currently contains unmerged migrations and launch utilities owned by
another session; parallel alternatives would create schema and state divergence.

## D-007 — Candidate Cloud project ownership is confirmed; reuse remains provisional

**Status:** Accepted for ownership; security/domain approval still blocks registration
**Decision:** `gen-lang-client-0818792107` owns the production XeroFlow OAuth client and
may be reused provisionally to preserve existing account grants. Do not register it to
Merchant until unrestricted-key findings are remediated/accepted and the Merchant
verified-domain gate passes.
**Reason:** The project number matches the production OAuth client prefix and the
client's origins/redirects include XeroFlow production and Cloudflare Pages. The project
also hosts unrelated workloads and at least one unrestricted API key, so ownership does
not establish clean isolation or registration readiness.

## D-008 — Merchant account topology

**Status:** Pending; blocks Merchant registration
**Decision needed:** Identify the controlling agency/advanced account and how client
subaccounts/standalone accounts will be accessed.
**Default:** Do not register per dealer or client subaccount.

Current evidence identifies an advanced agency Merchant topology with 50 subaccounts,
but its claimed website is client-owned rather than agency-owned. The registration
target therefore remains unapproved; the account may not be registered merely because
its hierarchy is operational.

## D-009 — Legacy Content API retirement

**Status:** Accepted
**Decision:** Maintain the existing read audit until Merchant API parity and live
comparison pass, then remove the legacy path in a dedicated reviewed task.
**Reason:** Avoid an observation gap while still preventing new legacy dependency.

## D-010 — Data Manager remains conditional

**Status:** Accepted
**Decision:** Verify and reuse the existing Data Manager integration for measurement
evidence. Do not make it a universal Merchant-readiness dependency.
**Reason:** Merchant/catalog health and first-party conversion delivery are distinct
failure domains.

## D-011 — YouTube API is opt-in scope

**Status:** Pending; does not block Releases 1-3
**Decision needed:** Whether XeroFlow must upload generated PMax videos.
**Default:** Use existing authorized YouTube video IDs or approved retail PMax behavior;
do not enable upload scope.

## D-012 — Completion is evidence-based

**Status:** Accepted
**Decision:** A task or phase is complete only when acceptance criteria, tests, review,
provider evidence where applicable and merge/deploy state are recorded.
**Reason:** This work spans external systems where committed code alone cannot prove
the intended outcome.

## D-013 — Cloudflare AI Gateway is the only inference egress

**Status:** Accepted
**Decision:** All campaign-job inference must use authenticated Cloudflare AI Gateway
dynamic routes. Direct-provider retry/fallback is prohibited for this workflow.
**Reason:** Central routing is required for cost controls, model versioning, privacy,
observability and an enforceable kill switch. A transparent provider bypass would make
those controls non-constitutional.

## D-014 — Cost-weighted model ladder

**Status:** Accepted as rollout baseline; production route versions require bake-off
**Decision:** Use deterministic code when possible. Start ordinary structured campaign
proposals on Groq GPT-OSS 20B; allow GPT-OSS 120B only for an explicit, measured complex
case. Evaluate a Workers AI JSON-capable small model for bounded low-risk extraction
and explanation. Budget/rate-limit exhaustion returns a deterministic incomplete
proposal or human-review state, not an automatic expensive upgrade.
**Reason:** Current Groq rates make 20B half the input/output token price of 120B, while
both support structured output. Quality, not parameter count, must earn escalation.

## D-015 — Metadata-only AI observability for campaign context

**Status:** Accepted
**Decision:** Preserve route/model/version, tokens, cost, latency, status and non-PII
correlation metadata while disabling request/response payload collection and caching
for client-specific campaign proposals.
**Reason:** Campaign briefs may contain client strategy, budgets and contacts. Usage
telemetry is useful; persisting raw payloads in gateway logs is unnecessary exposure.

## D-016 — Binding-first Gateway transport

**Status:** Accepted
**Decision:** Campaign jobs call dynamic routes through the existing Cloudflare `AI`
binding. They do not use an AI Gateway API token, provider-native SDK transport or the
shared Groq/Claude fallback chain.
**Reason:** Binding requests are pre-authenticated. Cloudflare AI Gateway Run tokens are
account-scoped and can execute against every gateway in the account, so placing one in
the Pages runtime creates unnecessary blast radius. The project already binds `AI` in
`wrangler.toml`.

## D-017 — Dedicated gateways and BYOK retention gate

**Status:** Accepted for architecture; security approval pending
**Decision:** Use separate preview and production campaign gateways with provider keys
stored through Cloudflare BYOK/Secrets Store. Do not use the shared `default` gateway.
Treat upstream provider retention as a separate gate from metadata-only Gateway logs.
**Reason:** Separate gateways isolate analytics, budgets and route promotion. Cloudflare
ZDR does not apply to BYOK traffic, and Groq is not currently listed as a supported ZDR
provider; log-payload suppression alone cannot satisfy an upstream-retention policy.

## D-018 — Bounded single-completion proposal path

**Status:** Accepted as pilot default; AIG-302 may tighten limits
**Decision:** Campaign proposals use no model tools, one structured completion and at
most one same-model schema repair. Initial bounds are 16K input, 2K output, two calls
and $0.01 estimated cost per proposal. A budget or provider failure returns an
incomplete/manual-review state and never triggers an unapproved expensive model.
**Reason:** Tool loops, repeated repair and automatic escalation are the material cost
and safety risks; the raw per-token difference between 20B and 120B is small at the
bounded proposal size. Gateway spend limits are eventually consistent, so application
bounds remain necessary.

## D-019 — Graphify Wiki is a confirmation gate

**Status:** Accepted
**Decision:** Use the Graphify Wiki/graph to corroborate codebase architecture and
dependency claims before implementation and promotion, then verify the cited source
directly. Record graph version/staleness warnings and resolve disagreements in favor of
current reviewed source.
**Reason:** The graph makes cross-module relationships visible, while direct source is
needed when the graph lags the active branch. The current graph confirms the existing
direct-Groq fallback, invocation ledger and model-assignment surfaces but reports an
older node-ID scheme and must not be treated as infallibly current.

## D-020 — AI Gateway route is the single model-routing authority

**Status:** Accepted
**Decision:** Campaign-job runtime selects an approved dynamic route, not a raw model.
The generic XeroFlow model-assignment system may catalogue/display the actual executed
provider/model but cannot override the route. Store the reviewed route-manifest release
and capture actual provider/model response metadata in the invocation ledger.
**Reason:** Allowing both the Gateway route and database model assignment to select a
model creates two control planes, invalidates evaluated route versions and can make
auditing record a configured model rather than the model that actually ran.

## D-021 — Pages environment selection uses encrypted bindings, not branch inference

**Status:** Accepted
**Decision:** Configure `CAMPAIGN_AI_DEPLOY_ENV`, gateway ID, route release, workflow
flag and HMAC key as same-named encrypted bindings separately for Pages Preview and
Production. Reject missing or invalid environment values. Do not add these selectors
to common Wrangler `[vars]` or infer `CF_PAGES_BRANCH` in request-time code.
**Reason:** Nitro deploy config makes Wrangler the Pages configuration source of truth,
and this repository's common plaintext `[vars]` replace dashboard plaintext values.
Cloudflare documents `CF_PAGES_BRANCH` for build-time customization. Encrypted
environment bindings survive the existing deploy path while keeping preview and
production routing, flags and pseudonyms isolated.
