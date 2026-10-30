# R07 — packages, quota accounting and costs

Date: 18 September 2026. **Research complete; D06 recommendation provisional.**
This defines a contract for later implementation. It does not introduce billing,
approve commercial packages, or enable generated customer code.

## Outcome and existing source

Use a versioned server-side capability policy and a durable reservation ledger.
Reserve before provider work; settle authenticated usage against that original
reservation. Keep commercial entitlements separate from software dependencies
and from platform security controls. Customer self-service remains the product
direction for every builder capability included in a package.

Alternatives: per-session counters are useful burst protection but cannot enforce
shared customer budgets; after-the-fact telemetry cannot prevent concurrent
overspend. Durable holds add reconciliation work, but make admission atomic and
leave uncertain provider work visible. Use both holds and telemetry, with the
existing session limit retained as an independent safety bound.

Inspected Dashboard `b26d0db542567c033feceab21e7ae951f374c4e5` and Studio
`13e7009e5b27b8a5fd9cb5732219b8fba8238493`. The R07 checkout starts from freshly
fetched Dashboard main `a917386dde67f06921843fd6e3a1ed1b4b984c6f`.

| Source | Reuse / gap |
| --- | --- |
| Dashboard `sessions.ts`, `sessionAuthority.ts` under `server/utils/pageStudio/` | Fresh package and session authority exists. `monthly_ai_operation_limit > 0` gates model capability; that predicate is not monthly spend accounting. |
| Studio `services/sandbox-worker/src/session-ledger.ts` and `packages/session/src/authorization.ts` | Durable per-session model-call consumption, keyed by session nonce. A new session is a different counter; this does not establish a customer-wide monthly budget. |
| Studio `services/sandbox-worker/src/index.ts`, `ai-generation.ts` | Each inference reserves a call against workspace limits and rechecks model authority. Preserve this protection when adding commercial accounting. |
| Studio business-content-worker migrations `0003_usage_ledger.sql`, `0004_usage_counters.sql` | Existing scoped idempotency and usage counters are useful foundations. They do not establish the multi-meter reservation/settlement contract below. |

This is a scoped source inventory, not a new live billing audit. No customer
usage, provider invoice or pricing setting was changed or read for this task.

## D06 proposal: capability and policy contract

Resolve `(tenant, client, app/site, environment, actor, action)` at the server.
The customer billing pool is `(tenant, client)` with explicit environment subcaps;
sites and simultaneous sessions cannot each receive the full shared allowance.
Account funding ceilings are an additional parent pool. Use a fixed parent-to-child
lock order for atomic reservations across all applicable pools. The prototype
tests one pool; hierarchical, multi-meter atomicity remains delivery work.

Policy versions are immutable records: policy ID/version, effective dates,
capability set, meter limits/period rules, maximum concurrency, serving policy,
overage mode, retention policy reference and audit author. Keep provider rate-card
versions separate. Reservations retain both versions; price changes never rewrite
historical usage. Apply a plan-change event once using its immutable event ID.

| Capability group | Example server actions | Commercial eligibility |
| --- | --- | --- |
| Website editing | `page.edit`, `draft.save`, `version.restore`, `asset.upload` | Proposed Website group, within its limits |
| CMS | `collection.define`, `record.write`, `binding.query`, `admin.open` | Proposed CMS/Business group; same APIs in Studio Content and client admin |
| Customer library | `component.create`, `component.version`, `component.insert` | Explicit policy grant; owner-scoped definitions and version pins |
| Generation | `generation.request`, `generation.retry`, `proposal.accept` | Grant plus reserved budget; no agency intervention for ordinary included work |
| Runtime | `preview.start`, `action.execute`, `connector.invoke` | Proposed Application group plus runtime/connector allowlists |
| Release | `release.publish`, `route.activate`, `resource.provision` | Role, current package, approved immutable artifact and fresh release authority |
| Recovery and usage | `usage.read`, `job.cancel`, `data.export`, `history.read` | Independently defined read/recovery permissions; no model allowance required |

These are proposed internal action names, not shipped API identifiers. Website,
CMS/Business, Application and Managed/Custom are PRD discussion groups, not
approved SKU names or prices. Role/tenant checks, schema validation, secret
isolation and outbound restrictions apply in every group. Higher payment never
bypasses them. Platform operators may impose stricter emergency limits.

Software policy separately pins allowed package names/versions, lockfile,
integrity, licence and vulnerability checks, network/install permissions and
runtime compatibility. A commercial upgrade does not approve arbitrary npm
packages, install scripts or network access. R09 owns generation/dependency trials.

## Quota units and attribution

| Meter | Unit / treatment |
| --- | --- |
| AI | Attempts plus input/output/cache tokens per provider/model; reserve a bounded cost envelope in integer USD micro-units. Every repair inference is another attempt. |
| Concurrent work | Active/reserved jobs and preview sessions; shared across sites, sessions and billing periods. Retain slots for uncertain running work. |
| Build/preview | Builds, wall duration, vCPU-seconds, provisioned GiB-seconds and disk GB-seconds; include idle time until confirmed sleep. |
| Worker actions | Requests/RPC, CPU milliseconds and identity/version activity by day. Distinguish Dynamic Workers and WFP attribution. |
| Deployments | Attempts, successful immutable releases, active scripts and retained versions. A retry of one external operation reuses its identity. |
| Database | Actual rows read/written, storage byte-time, indexes and migration writes; not merely number of HTTP calls. |
| Assets | Stored byte-time, class A/B operations, transformations and separately priced egress. |
| Connectors | Per-provider calls, externally billable units and mutation attempts; require their own approved grants and limits. |

Store original usage facts, unit, provider account/request identity, job/attempt,
scope, occurred/received times, period and immutable rate version. Aggregate for
display; do not use browser counters as authority. Billable customer units and
provider costs are separate projections of the facts. Use decimal/integer
arithmetic for actual money; the small estimate calculator is not invoice code.

## Reservation and lifecycle rules

1. Admission freshly resolves identity, role, package and security policy. Server
   selects the billing period and maximum cost/usage envelope. Atomically check
   `spent + held + requested <= allowance` and reserve every applicable meter
   and concurrency slot. Denial has no partial holds and triggers no provider call.
2. Bind operation/attempt IDs to scope, request digest, model, resource envelope
   and period. Same ID/same request returns the retained result; changed input
   conflicts. A returned reservation is not permission to execute again.
3. Claim execution once and recheck fresh authority/policy. Queued work from a
   changed policy revision needs deliberate cancellation/re-admission. A running
   job requires per-effect authorization and bounded leases in the real broker.
4. Settle only trusted, terminal usage. Deduplicate `(provider account, receipt ID)`
   and bind the receipt to the original job and facts. Preserve conflicting
   receipts for investigation; never double-charge or silently replace facts.
5. Charge actual usage and release the unused hold only after confirmed terminal
   completion. Late receipts retain the original reservation period even after
   downgrade, expiry or period rollover. Accounting records an incurred cost;
   it does not authorize publication or another effect.
6. Queued cancellation can release a hold under the same execution lock. Running
   cancellation or a lost provider response retains money and slots until proven
   stopped/reconciled. Lease timeout alone is not proof that external work stopped.
7. Transport retries reuse the same attempt. A new inference/repair needs a new
   reservation; invalid model output can still incur cost. Limit attempts and
   total envelope. Provider failures and customer refund policy are separate.
8. If actual provider usage exceeds the reservation, retain the true cost, freeze
   new admissions and alert/reconcile. Never truncate a receipt to make a budget
   look satisfied. R06 CPU containment remains unresolved: this ledger proves an
   admission ceiling, **not a guaranteed provider invoice ceiling**.

Do not hold a database transaction open during a model/provider request. The
production design needs relational reservation/event tables, outbox delivery,
provider operation IDs, durable reconciliation and a terminal recovery path for
providers that never return. R08 rehearses lost responses and crash recovery;
R11 validates contention/capacity. PostgreSQL was used to test locking here;
this does not change R03's provisional D1 CMS-content recommendation.

## Downgrade, expiry and overage

- Immediate suspension blocks new privileged operations and rechecks at execution
  and publish; access loss is handled by the authority contract, not a grace cache.
- Lowering an allowance below spent/held usage blocks more work; it does not erase
  records, release running reservations or rewrite previous charges.
- Content/schema/component versions remain retained. Authorized history/export
  and cancellation can be independent from paid generation. No downgrade starts
  deletion. Retention duration and final deletion require a separately approved,
  published policy and lifecycle procedure.
- Published serving has its own explicit policy (continue, restricted grace or
  suspend at a defined boundary). A billing error must not accidentally delete a
  live site. Duration and treatment are product decisions before launch, not an
  implied indefinite free-hosting promise.
- Recommended initial overage mode is deny-new-work at allowance, with clear
  usage/held-budget UI. Do not silently auto-buy or invoice extras. Opt-in paid
  overages need a versioned agreement, monetary ceiling and payment handling.

## Current provider rate reference

Checked official pages on **18 September 2026**. USD published list prices;
included quantities below are account-level, not free allowances per customer.
The estimates do not establish the account's actual negotiated terms.

| Provider product | Published included usage / additional rate | Source |
| --- | --- | --- |
| Workers Standard | $5/month minimum; 10M requests and 30M CPU-ms; +$0.30/M requests, +$0.02/M CPU-ms | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Workers for Platforms | $25/month; 20M requests, 60M CPU-ms, 1,000 scripts; +$0.30/M requests, +$0.02/M CPU-ms, +$0.02/script | [WFP pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/) |
| Dynamic Workers | Standard request/CPU pool; 1,000 unique workers/month stated; excess $0.002/worker/day | [Dynamic pricing](https://developers.cloudflare.com/dynamic-workers/pricing/) |
| D1 paid | 25B row reads, 50M row writes, 5GB storage/month; +$0.001/M reads, +$1/M writes, +$0.75/GB-month | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| R2 Standard | 10GB-month, 1M class A, 10M class B; +$0.015/GB-month, +$4.50/M A, +$0.36/M B; excess billing units round up | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Containers | Included 25GiB-hours memory, 375vCPU-minutes, 200GB-hours disk; +$0.0000025/GiB-second, +$0.000020/vCPU-second, +$0.00000007/GB-second | [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/) |
| Durable Objects paid compute | 1M requests and 400,000GB-seconds; +$0.15/M requests, +$12.50/M GB-seconds; consult excess-unit rounding | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |

WFP counts one request across dispatch/user/outbound and aggregates their CPU;
do not triple-charge it or also put it into a Standard request pool. Dynamic
requests/CPU belong to the Standard pool. Its identity charge became billable
26 May 2026: older statements that it is not yet billed are superseded. Changing
ID or code affects identity counts; no ID can count each invocation. Record daily
identities and code hashes. The monthly-unique inclusion versus daily charging
needs provider reconciliation before invoice automation; the calculator accepts
already-billable worker-days and does not guess that allocation.

Container memory/disk use provisioned size while running, CPU uses actual work;
sleep ends container charging. Container egress is separately priced: Oceania
includes 500GB/month then $0.05/GB. Worker/DO and logs add costs. Sandbox is built
on Containers; see [Sandbox pricing](https://developers.cloudflare.com/sandbox/platform/pricing/).
Do not assume that free R2/Workers egress also makes container egress free.

## Reproducible examples, not retail prices

The [calculator](./spikes/r07/costs.mjs) estimates selected **account/month**
line items. Subtract shared inclusions once across all tenants. Examples are
synthetic usage, not measurements or full customer operating costs.

| Input | Arithmetic / selected cost |
| --- | --- |
| WFP 100M requests, 1B CPU-ms, 1,200 scripts | $25 + $24 + $18.80 + $4 = **$71.80**, reproducing the official example |
| Standard 20M requests, 40M CPU-ms | $5 + $3 + $0.20 = **$8.20** |
| 2,000 provider-confirmed billable Dynamic worker-days | 2,000 × $0.002 = **$4**, plus its Standard usage |
| R2 10.1GB-month, 1,000,001 A and 10,000,001 B | Rounded overages: $0.015 + $4.50 + $0.36 = **$4.875** before invoice-level currency rounding |
| D1 26B reads, 60M writes, 10GB-month | $1 + $10 + $3.75 = **$14.75** |

AI cost input must use the chosen model's effective rate card:
`input_tokens * input_rate + output_tokens * output_rate + cache/tool charges`,
with units normalized. R09 has not selected/evaluated the generation workload,
so no assumed model rate or invented all-in generation price is presented.
Container/DO duration, regional egress, Neon, model/tool calls, logs, connectors,
tax, FX, support and margin are excluded from these example totals. R11 supplies
measured volumes; product chooses customer prices afterward.

## Verification and limits

[Runnable experiment](./spikes/r07/README.md): **30 tests pass**, including 25
real PostgreSQL behavior cases and five price-arithmetic cases. Node 24.18.0,
PostgreSQL 14.19, existing pg 8.22.0. Evidence:
`.verification/page-studio-builder-rnd-20260917/r07-tests.log` in the Dashboard
workspace. The runner stops its disposable cluster; no remote database is used.

Tests were written first and failed on the missing implementation. The first
implemented run passed 24/25 and exposed JSONB key-order sensitivity in duplicate
admission; field comparison fixed it. Five additional policy/concurrency cases
then passed. Independent review corrected the Dynamic inclusion assumption and
identified the recovery limits now recorded above. The final section run includes
that correction. No application sources changed; full app suites/build/deploy
were not rerun for research files.

The experiment uses trusted synthetic scope and one budget meter plus concurrency.
It does not prove authenticated provider receipts, parent/client/environment
pool atomicity, effect revocation, provider exactly-once work, lost-commit recovery,
multi-region contention, invoicing, retention deletion or browser UX. A new ledger
object reads persisted state; no PostgreSQL process-restart test is claimed.
Policy patch retries increment revision; event-id dedup is a production requirement.

## Delivery handoff and open decisions

- **A01 / C01:** implement policy resolution and hierarchical reservations with
  real scope/period selection, immutable version/event IDs and outbox/reconciliation.
- **C02–C04 / R09:** model-specific envelopes, bounded attempts and cancellation;
  trusted receipt ingestion with cost and output acceptance kept separate.
- **R08 / R11:** prove recovery and resource lifecycle, then measure contention,
  preview sleep, code churn and actual costs; reconcile provider inclusions.
- **Product:** choose SKUs, numeric allowances, currency/tax treatment, margins,
  overages/refunds, serving grace and retention. No defaults are activated here.
- **R12:** accept or revise D06 alongside the other architecture decisions.

R07 closes a research task only. R06 remains partial and generated execution stays
disabled. All 26 A–E delivery tasks remain open; client admin linked to Page Studio
and shared CMS records remain the first delivery priority. The prior staging
navigation recheck still awaits sign-in and is not a pass from this experiment.
