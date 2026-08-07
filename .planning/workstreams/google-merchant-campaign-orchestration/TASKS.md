# Executable Task Register

**Status vocabulary:** `pending`, `in_progress`, `blocked`, `complete`
**Completion rule:** Every completed task must link verification evidence and a
commit/PR. Provider tasks also require a sanitized live read-back or an explicit
`not_proven` result accepted by the phase gate.

## Progress summary

| Phase | Complete | Total | Status |
|---|---:|---:|---|
| 0 — Governance and reconciliation | 2 | 9 | In progress |
| 1 — Merchant read foundation | 0 | 10 | Pending |
| 2 — Commerce readiness | 0 | 8 | Pending |
| 3 — AI-assisted jobs | 0 | 7 | Pending |
| 4 — Paused Ads launch | 0 | 8 | Pending |
| 5 — Controlled Merchant writes | 0 | 5 | Pending |
| 6 — Production rollout and closure | 0 | 7 | Pending |
| **Total** | **2** | **54** | **4%** |

## Phase 0 — governance and dependency reconciliation

### [x] CTL-001: Create an isolated worktree and workstream

**Status:** complete
**Description:** Isolate all planning and future implementation from the dirty root
and concurrent PMax session.
**Acceptance:** Dedicated branch/worktree exists; GSD workstream is active; no other
worktree files changed.
**Verification:** `git worktree list`; `gsd-sdk query workstream.status
google-merchant-campaign-orchestration --raw --cwd <worktree>`
**Dependencies:** None
**Files:** `.planning/active-workstream`, workstream directory
**Size:** S

### [x] CTL-002: Establish canonical PRD, requirements and roadmap

**Status:** complete
**Description:** Capture API boundaries, releases, requirements, dependency graph,
hard gates and completion policy.
**Acceptance:** PRD, requirement matrix, roadmap, decisions and API registry cross-link
and contain no credentials.
**Verification:** Documentation link/heading checker; secret-pattern scan; human review
at Phase 0 checkpoint.
**Dependencies:** CTL-001
**Files:** workstream planning documents
**Size:** M

### [ ] CTL-003: Verify Cloud project and OAuth-client ownership

**Status:** pending
**Description:** Determine whether `gen-lang-client-0818792107` owns XeroFlow's
production OAuth client and is appropriate as the long-lived integration project.
**Acceptance:** Project ID/number and client suffix mapping recorded; redirect/verified
domain ownership reviewed; result is confirmed or rejected.
**Verification:** Sanitized Cloud Console/gcloud evidence with no secret values.
**Dependencies:** CTL-002
**Files:** `API-REGISTRY.md`, restricted operator evidence outside Git if necessary
**Size:** S

### [ ] CTL-004: Inventory enabled APIs and authorization prerequisites

**Status:** pending
**Description:** Verify Merchant, Ads and existing Data Manager enablement and classify
YouTube/legacy services.
**Acceptance:** Required services enabled; conditional services have decisions; OAuth
scopes/consent status and Ads developer-token access level are known.
**Verification:** Bounded service list and read-only Ads API call.
**Dependencies:** CTL-003
**Files:** `API-REGISTRY.md`
**Size:** S

### [ ] CTL-005: Approve the Merchant advanced-account topology

**Status:** pending
**Description:** Map the agency controlling account, subaccounts and standalone client
accounts before one-time developer registration.
**Acceptance:** Owner signs off registration target, verified domain, admin actor and
developer email; project is confirmed not registered elsewhere.
**Verification:** Sanitized Merchant Center hierarchy evidence and decision entry.
**Dependencies:** CTL-003
**Files:** `DECISIONS.md`, `API-REGISTRY.md`
**Size:** S

### [ ] CTL-006: Register the chosen project with Merchant API

**Status:** blocked pending CTL-005
**Description:** Execute the one-time registration against the approved controlling
Merchant account and verify propagation.
**Acceptance:** Registration is active; developer has API Developer plus approved
least-privilege access; bounded account read succeeds.
**Verification:** Redacted `registerGcp` result and follow-up read.
**Dependencies:** CTL-004, CTL-005
**Files:** Operational evidence only; `STATE.md`
**Size:** S

### [ ] CTL-007: Select direct and subaccount pilot fixtures

**Status:** pending
**Description:** Choose non-destructive accounts that exercise direct and manager/
subaccount authentication plus representative data sources/issues.
**Acceptance:** Pilot owners and allowed operations recorded; test data contains no
committed client-sensitive values; write allowlist remains empty.
**Verification:** Read-only Ads and Merchant access results.
**Dependencies:** CTL-004, CTL-005
**Files:** `STATE.md`, restricted rollout record
**Size:** S

### [ ] CTL-008: Rebase after the concurrent PMax session

**Status:** blocked until the other session finishes
**Description:** Rebase onto updated `main`, inspect migrations 273-282 and launch
utilities, and resolve planning assumptions.
**Acceptance:** Clean rebase; shared schemas/modules listed; duplicate planned work
removed; migration numbering refreshed.
**Verification:** `git diff main...HEAD`; contract-diff notes; focused existing PMax
tests pass.
**Dependencies:** Concurrent session merged
**Files:** `PRD.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `TASKS.md`, `STATE.md`
**Size:** M

### [ ] CTL-009: Establish a clean executable baseline

**Status:** in_progress; clean baseline passed and must be refreshed after CTL-008
**Description:** Install dependencies with Node >=24 and record baseline focused tests,
typecheck/build constraints before implementation.
**Acceptance:** Frozen-lockfile install succeeds; environment uses supported Node;
selected baseline tests pass or pre-existing failures are documented.
**Verification:** `pnpm install --frozen-lockfile`; focused Google tests; relevant
typecheck; optional build at the pre-implementation checkpoint.
**Dependencies:** CTL-008 for final post-rebase baseline
**Files:** No tracked files unless baseline findings update `STATE.md`
**Size:** S

### Phase 0 checkpoint

- [ ] Required APIs and OAuth project are verified.
- [ ] Merchant topology and registration are approved and proven.
- [ ] Direct and subaccount read-only calls succeed.
- [ ] PMax concurrent work is merged and contracts reconciled.
- [ ] Supported Node/dependency baseline is executable.
- [ ] Human owner accepts Phase 0 evidence.

## Phase 1 — read-only Merchant API foundation

### [ ] MER-101: Implement Merchant transport and auth adapter

**Status:** pending
**Description:** Add a server-only Merchant REST client using existing encrypted Google
credential profiles, abort timeouts, pagination and redacted errors.
**Acceptance:** Auth refresh works; base URL/version are centralized; retry policy is
bounded; no mutation methods exist.
**Verification:** Unit tests for token refresh, headers, timeout, 401/403/429/5xx and
redaction.
**Dependencies:** Phase 0
**Likely files:** `server/utils/googleMerchantClient.ts`, client tests
**Size:** M

### [ ] MER-102: Read Merchant accounts, roles and service links

**Status:** pending
**Description:** Retrieve accessible account hierarchy and Google Ads service-link
evidence.
**Acceptance:** Resource names/roles/raw enums retained; controlling/subaccount
relationships normalized; inaccessible values remain unknown.
**Verification:** Direct and subaccount fixtures plus bounded live comparison.
**Dependencies:** MER-101
**Likely files:** Merchant client, account normalizer, tests
**Size:** M

### [ ] MER-103: Read and normalize data-source health

**Status:** pending
**Description:** Retrieve data sources and processing/fetch evidence needed for
readiness.
**Acceptance:** Type, schedule, last activity, target scope and errors normalized;
pagination proven; unknown enum preserved.
**Verification:** Fixture and live UI comparison tests.
**Dependencies:** MER-101
**Likely files:** Merchant client, data-source normalizer, tests
**Size:** M

### [ ] MER-104: Read product health and issue aggregates

**Status:** pending
**Description:** Retrieve bounded product/status/issue evidence without persisting an
unnecessary full catalogue.
**Acceptance:** Eligible/pending/disapproved and issue aggregates reconcile; item-level
samples are capped/redacted; pagination/rate limits handled.
**Verification:** Deterministic multi-page fixtures and live aggregate comparison.
**Dependencies:** MER-101
**Likely files:** Merchant client, product-health normalizer, tests
**Size:** M

### [ ] MER-105: Add tenant-scoped Merchant observation schema

**Status:** pending
**Description:** Persist scan runs, current account/data-source state, aggregate product
health and material events using additive/idempotent migrations.
**Acceptance:** Tenant/resource uniqueness, freshness and cascade rules are explicit;
no credential/product-PII fields; indexes match access paths.
**Verification:** Migration source tests, automatic DB apply per project rules, catalog
queries and idempotent rerun.
**Dependencies:** MER-102 to MER-104 contracts
**Likely files:** One migration, migration test
**Size:** S

### [ ] MER-106: Implement repository and scan lifecycle

**Status:** pending
**Description:** Claim runs, scan accounts, retain partial successes, upsert current
state and emit material events.
**Acceptance:** Overlap dedupes; identical scan changes freshness only; failures are
redacted; tenant boundaries enforced.
**Verification:** Repository/scanner unit tests including races and transaction failure.
**Dependencies:** MER-102 to MER-105
**Likely files:** Merchant repository, scanner, two test files
**Size:** M

### [ ] MER-107: Add manual scan and status endpoints

**Status:** pending
**Description:** Expose tenant-scoped manual scan command and terminal-state polling.
**Acceptance:** Auth/permission/tenant required; optional account is scope-checked;
duplicates return existing run; no secrets in response.
**Verification:** Endpoint tests for 401/403/404/dedupe/partial/success.
**Dependencies:** MER-106
**Likely files:** Two Nitro endpoints, endpoint tests
**Size:** M

### [ ] MER-108: Add queued and scheduled refresh

**Status:** pending
**Description:** Route bounded scans through Cloudflare queue/scheduled Worker patterns
with freshness and retry controls.
**Acceptance:** Queue message contains references only; cron is authenticated;
overlapping runs dedupe; dead-letter/manual recovery documented.
**Verification:** Worker/cron contract tests and preview scheduled invocation.
**Dependencies:** MER-106, MER-107
**Likely files:** Queue producer/consumer or pages-cron route, tests, config
**Size:** M

### [ ] MER-109: Migrate the inventory-feed audit

**Status:** pending
**Description:** Replace legacy Content API data-feed reads with Merchant API evidence
while preserving operational output semantics.
**Acceptance:** Merchant result has parity or documented intentional differences;
legacy path is clearly deprecated; no new Content API calls remain.
**Verification:** Side-by-side sanitized audit on pilot accounts and script tests.
**Dependencies:** MER-103, MER-104
**Likely files:** `scripts/audit-inventory-feeds.ts`, helper/tests, runbook note
**Size:** M

### [ ] MER-110: Battle-test Merchant read foundation

**Status:** pending
**Description:** Review every file and validate direct/subaccount, empty, partial,
permission, stale, quota and new-enum behavior.
**Acceptance:** Focused tests/typecheck/build pass; security review finds no secret or
tenant leakage; live comparisons recorded.
**Verification:** Phase evidence file and review findings resolved.
**Dependencies:** MER-101 to MER-109
**Likely files:** Tests/evidence only
**Size:** M

### Phase 1 checkpoint

- [ ] Merchant read-only client is proven against live direct and subaccount paths.
- [ ] Persistence and scans are tenant-safe and resumable.
- [ ] Legacy audit parity is accepted.
- [ ] No Merchant mutation is reachable.

## Phase 2 — unified commerce readiness

### [ ] RDY-201: Implement the pure readiness classifier

**Status:** pending
**Description:** Convert normalized Merchant, Ads link, budget, conversion and asset
evidence into versioned blockers/warnings/status.
**Acceptance:** Precedence and thresholds explicit; every outcome cites evidence and
remediation; unknown/stale fail closed.
**Verification:** Table-driven unit tests for every rule and conflict combination.
**Dependencies:** Phase 1, merged PMax preflight contracts
**Likely files:** Readiness utility/types/tests
**Size:** M

### [ ] RDY-202: Persist readiness state and material events

**Status:** pending
**Description:** Store current classification, rule version and material transitions
without duplicating raw observations.
**Acceptance:** Freshness-only rescan emits no event; rule-version change is visible;
tenant/resource uniqueness enforced.
**Verification:** Repository and migration tests.
**Dependencies:** RDY-201
**Likely files:** Migration, repository, tests
**Size:** M

### [ ] RDY-203: Add readiness list/detail/summary/export APIs

**Status:** pending
**Description:** Provide server-paginated operational views and formula-safe export.
**Acceptance:** Zod-bounded filters; summaries reconcile; cross-tenant ID returns 404;
export is capped and formula-safe.
**Verification:** Endpoint tests for filters, paging, tenancy and CSV injection.
**Dependencies:** RDY-202
**Likely files:** List/detail/export endpoints, shared parser, tests
**Size:** M

### [ ] RDY-204: Build the readiness portfolio surface

**Status:** pending
**Description:** Add summary, filters, table, pagination and robust degraded states with
Nuxt UI v4.
**Acceptance:** Mobile/dark/keyboard accessible; non-empty select sentinels; scan state
and freshness visible; unknown never looks healthy.
**Verification:** Component tests and browser matrix.
**Dependencies:** RDY-203
**Likely files:** Page, summary/table components, tests
**Size:** M

### [ ] RDY-205: Build evidence detail and remediation workflow

**Status:** pending
**Description:** Show provider evidence, issues, rule explanations, history and safe
deep links in a slideover.
**Acceptance:** Raw new enums remain visible; timestamps/source named; no editable
provider controls; links restricted to approved Google origins.
**Verification:** Component tests and keyboard/screen-reader review.
**Dependencies:** RDY-203
**Likely files:** Detail slideover, presentation utility, tests
**Size:** M

### [ ] RDY-206: Compose readiness into PMax brief and preflight

**Status:** pending
**Description:** Make the merged launch preflight consume the structured readiness
contract and selected Merchant/product scope.
**Acceptance:** UI and launch decision use the same result; stale/blocked prevents
approval; override policy is explicit and audited.
**Verification:** API/integration tests for ready, blocked, stale and post-approval drift.
**Dependencies:** RDY-201, CTL-008
**Likely files:** PMax preflight adapter, brief API/view, tests
**Size:** M

### [ ] RDY-207: Add deduplicated readiness notifications and operations data

**Status:** pending
**Description:** Notify internal staff of newly blocked/materially changed states while
respecting existing quiet-hours and dedupe patterns.
**Acceptance:** Notifications default off; no client fan-out; daily unresolved digest
dedupes; operational counts expose scan/queue health.
**Verification:** Notification/repository/cron tests.
**Dependencies:** RDY-202
**Likely files:** Notification utility, cron integration, tests
**Size:** M

### [ ] RDY-208: Update marketing pages and release runbook

**Status:** pending
**Description:** Document the delivered Merchant readiness capability publicly and the
operator release/rollback sequence internally.
**Acceptance:** Feature index/detail/navigation are consistent; dark mode verified;
runbook covers flags, migrations, first scan, sign-off and rollback.
**Verification:** Content tests/build and light/dark browser check.
**Dependencies:** RDY-204 to RDY-207
**Likely files:** Marketing pages/nav, runbook, tests
**Size:** M

### Phase 2 checkpoint

- [ ] Readiness API/UI/preflight reconcile on pilot accounts.
- [ ] Degraded and cross-tenant states are battle tested.
- [ ] Notifications remain disabled until production sign-off.
- [ ] Public and operator documentation match delivered scope.

## Phase 3 — AI-assisted campaign jobs

### [ ] JOB-301: Define the versioned campaign-job proposal contract

**Status:** pending
**Description:** Normalize template inputs, evidence, missing fields, recommendations,
tasks and launch linkage into one deterministic schema.
**Acceptance:** Facts/defaults/inferences separated; Zod validation and versioning;
provider-impacting fields explicit.
**Verification:** Contract and fixture tests.
**Dependencies:** Phase 2
**Likely files:** Shared/server types, normalizer, tests
**Size:** M

### [ ] JOB-302: Assemble bounded recommendation context

**Status:** pending
**Description:** Retrieve approved template/playbook, readiness and account evidence for
the AI assistant without credentials or unbounded product data.
**Acceptance:** Tenant isolation, citations/freshness, token budget and evidence rank
are deterministic; failures degrade safely.
**Verification:** Context-retrieval unit tests.
**Dependencies:** JOB-301
**Likely files:** Context builder, tests
**Size:** M

### [ ] JOB-303: Add the proposal-only AI tool

**Status:** pending
**Description:** Let the assistant propose a campaign job and identify missing inputs;
do not create jobs or call providers.
**Acceptance:** Tool schema validated; unsupported assumptions rejected; direct
provider mutations absent; output maps to JOB-301.
**Verification:** AI tool tests including prompt injection and missing evidence.
**Dependencies:** JOB-301, JOB-302
**Likely files:** AI tool, registry entry, tests
**Size:** M

### [ ] JOB-304: Add confirmed job/task execution

**Status:** pending
**Description:** Convert an accepted proposal into existing XeroFlow job/task records
through propose-confirm-execute and pending-action patterns.
**Acceptance:** Confirmation binds payload hash; idempotent retry; assignments and due
dates validated; audit event recorded.
**Verification:** Executor and endpoint tests.
**Dependencies:** JOB-303
**Likely files:** Executor, pending-action adapter, tests
**Size:** M

### [ ] JOB-305: Build campaign-job review form

**Status:** pending
**Description:** Present missing inputs, inferred recommendations, readiness evidence
and task preview for user editing/confirmation.
**Acceptance:** Frontend-design skill applied before form edits; Nuxt UI fields use
`UFormField`; exact provider values and evidence visible; responsive/dark accessible.
**Verification:** Component tests and browser/keyboard review.
**Dependencies:** JOB-303
**Likely files:** Review component/page, composable, tests
**Size:** M

### [ ] JOB-306: Record proposal decisions and feedback

**Status:** pending
**Description:** Persist accepted/edited/rejected recommendation decisions and later
outcome links without allowing self-modifying playbooks.
**Acceptance:** Actor/version/evidence recorded; no hidden reasoning stored; feedback is
advisory data only.
**Verification:** Migration/repository/API tests.
**Dependencies:** JOB-304
**Likely files:** Migration, repository/API, tests
**Size:** M

### [ ] JOB-307: Run end-to-end internal job pilot

**Status:** pending
**Description:** Complete one template-to-confirmed-job workflow with account manager
and media buyer, without provider writes.
**Acceptance:** Missing inputs resolved; generated tasks accepted or edited; audit
history complete; usability findings addressed.
**Verification:** Sanitized pilot evidence and stakeholder sign-off.
**Dependencies:** JOB-301 to JOB-306
**Likely files:** Evidence/docs and resulting fixes
**Size:** M

### Phase 3 checkpoint

- [ ] Internal job assistance is useful and auditable.
- [ ] No AI-accessible provider mutation exists.
- [ ] Human confirmation and idempotency are proven.

## Phase 4 — paused PMax launch and activation

### [ ] ADS-401: Verify Ads-Merchant link and selected product scope

**Status:** pending
**Description:** Compose Merchant service-link and listing-filter evidence into the
launch plan.
**Acceptance:** Merchant ID/link/product scope are explicit; zero-product filters block;
final URL domain compatibility is checked.
**Verification:** Preflight tests and live read-only pilot evidence.
**Dependencies:** RDY-206
**Likely files:** Launch config/preflight adapter, tests
**Size:** M

### [ ] ADS-402: Adopt the merged immutable launch-plan contract

**Status:** pending
**Description:** Add Merchant readiness references to the merged configuration/hash
without creating a competing plan model.
**Acceptance:** Material Merchant selection changes invalidate approval; hash/version
behavior remains deterministic; migrations are additive.
**Verification:** Hash, state and migration tests.
**Dependencies:** CTL-008, ADS-401
**Likely files:** Existing PMax config/hash/store, migration, tests
**Size:** M

### [ ] ADS-403: Implement validate-only launch preflight

**Status:** pending
**Description:** Build provider requests and run supported validation without live
resource creation.
**Acceptance:** Exact operation order/fields visible in safe preview; validation errors
redacted/actionable; approval cannot bypass new blockers.
**Verification:** Request contract tests and preview validation call.
**Dependencies:** ADS-402
**Likely files:** Google PMax client/executor preview, tests
**Size:** M

### [ ] ADS-404: Implement idempotent paused resource creation

**Status:** pending
**Description:** Execute ordered CampaignBudget, Campaign, AssetGroup, assets/listing
filters and related resources using claims and resumable phases.
**Acceptance:** Campaign status is PAUSED; retries resume safely; duplicate command
creates no duplicate resource; every resource name recorded.
**Verification:** Contract/failure-injection tests and allowlisted preview pilot.
**Dependencies:** ADS-403 and explicit live-write approval
**Likely files:** PMax client, launch executor, repository, tests
**Size:** M

### [ ] ADS-405: Add provider read-back reconciliation

**Status:** pending
**Description:** Read all material settings after creation and compare with approved
plan.
**Acceptance:** Field-level match/mismatch/unknown persisted; mismatch blocks activation;
read-back is retryable without recreating resources.
**Verification:** Reconciliation unit/endpoint tests and live pilot evidence.
**Dependencies:** ADS-404
**Likely files:** Read-back client, reconciler, tests
**Size:** M

### [ ] ADS-406: Implement separate activation approval and command

**Status:** pending
**Description:** Require a new owner/admin approval after successful verification before
enabling the campaign.
**Acceptance:** Creation approval cannot enable; stale/mismatched readiness invalidates
activation; enable response read back and audited.
**Verification:** Permission/state/idempotency API tests and pilot activation evidence.
**Dependencies:** ADS-405
**Likely files:** Approval/action endpoints, executor, tests
**Size:** M

### [ ] ADS-407: Link campaign monitoring and drift findings

**Status:** pending
**Description:** Attach provider campaign to media spend, pacing, conversion and Merchant
health monitoring after creation.
**Acceptance:** Identity is unambiguous; first sync proven; custom-period semantics
preserved; Merchant drift creates findings without auto-remediation.
**Verification:** Integration tests and first production/pilot sync evidence.
**Dependencies:** ADS-405
**Likely files:** Spend link adapter, monitoring/reconciliation, tests
**Size:** M

### [ ] ADS-408: Battle-test the complete paused-launch workflow

**Status:** pending
**Description:** Exercise duplicate, timeout, partial create, policy rejection, stale
approval, mismatch, kill-switch and recovery cases before production.
**Acceptance:** No unapproved spend; all failures land in recoverable state; audit trail
and runbook match observed behavior.
**Verification:** Phase test suite, security/code review, preview E2E and sign-off.
**Dependencies:** ADS-401 to ADS-407
**Likely files:** Tests, runbook, fixes
**Size:** M

### Phase 4 checkpoint

- [ ] One allowlisted campaign is created paused without duplicates.
- [ ] Read-back matches approved plan.
- [ ] Separate activation is proven and audited.
- [ ] Spend and readiness monitoring are linked.

## Phase 5 — controlled Merchant writes

### [ ] WRT-501: Approve a dedicated Merchant mutation policy

**Status:** pending
**Description:** Select narrow write operations, ownership, permissions, risk limits and
rollback/reconciliation behavior after read-only production evidence.
**Acceptance:** Each operation type explicitly approved; prohibited fields/actions
listed; allowlist and kill switch defined.
**Verification:** Security/media/platform owner sign-off.
**Dependencies:** Stable Phases 1-4
**Likely files:** PRD/decision/runbook updates
**Size:** S

### [ ] WRT-502: Implement approved data-source operation

**Status:** pending
**Description:** Add one narrow data-source write with preview, approval, idempotency and
read-back.
**Acceptance:** Exact target/payload shown; least privilege; retry safe; mismatch
recoverable; disabled by default.
**Verification:** Contract, permission, idempotency and live allowlist tests.
**Dependencies:** WRT-501
**Likely files:** Merchant client operation, executor/API, tests
**Size:** M

### [ ] WRT-503: Implement approved product/inventory operation

**Status:** pending
**Description:** Add only the product field operation approved in WRT-501.
**Acceptance:** Business source-of-truth ownership verified; policy-sensitive fields
blocked; batch bounds explicit; read-back reconciles.
**Verification:** Validation/idempotency/batch/partial-failure tests and allowlist pilot.
**Dependencies:** WRT-501
**Likely files:** Merchant operation, executor/API, tests
**Size:** M

### [ ] WRT-504: Add Merchant write reconciliation and drift findings

**Status:** pending
**Description:** Reconcile approved writes and surface later drift without silent
remediation.
**Acceptance:** Expected/current/mismatch visible; retry never duplicates; operator can
resolve or acknowledge with reason.
**Verification:** Repository/API/UI tests.
**Dependencies:** WRT-502 or WRT-503
**Likely files:** Reconciler, endpoints/UI, tests
**Size:** M

### [ ] WRT-505: Complete Merchant-write pilot and policy review

**Status:** pending
**Description:** Run one approved operation on an allowlisted account and review whether
scope should broaden, remain restricted or be removed.
**Acceptance:** Provider read-back proven; no unrelated products affected; audit and
rollback/recovery evidence accepted.
**Verification:** Sanitized production evidence and owner decision.
**Dependencies:** WRT-502 to WRT-504 as applicable
**Likely files:** Evidence/runbook and fixes
**Size:** M

## Phase 6 — production rollout and closure

### [ ] REL-601: Complete pre-release security and quality review

**Status:** pending
**Description:** Deep-read all changed files and review tenancy, secrets, permissions,
idempotency, SSRF/URL handling, logs, forms and Cloudflare configuration.
**Acceptance:** All blocking findings fixed; project pre-commit checklist complete;
focused suites/typecheck/build/deploy check pass.
**Verification:** Review report and command log.
**Dependencies:** Required implementation phases
**Likely files:** Review/evidence and fixes
**Size:** M

### [ ] REL-602: Deploy and verify preview

**Status:** pending
**Description:** Apply migrations, deploy with guarded preview command and run direct/
subaccount read-only and authorized UI checks.
**Acceptance:** `pnpm deploy:check` passes; preview healthy; required degraded states and
kill switches tested; no production writes.
**Verification:** Preview URLs, logs and sanitized screenshots/results.
**Dependencies:** REL-601
**Likely files:** Evidence/runbook fixes
**Size:** M

### [ ] REL-603: Release production read-only readiness

**Status:** pending
**Description:** Deploy with scans/notifications safely staged and a tenant/account
allowlist.
**Acceptance:** First manual scan compared with provider UI; scheduled scan enabled only
after sign-off; notifications remain off until separately approved.
**Verification:** Production health, scan and database evidence.
**Dependencies:** REL-602, Phase 2
**Likely files:** State/evidence/runbook
**Size:** M

### [ ] REL-604: Release AI job assistance pilot

**Status:** pending
**Description:** Enable proposal/task creation for selected staff without provider
writes.
**Acceptance:** Pilot workflow completed; task quality and audit accepted; support and
rollback path proven.
**Verification:** User acceptance record and operational metrics.
**Dependencies:** REL-603, Phase 3
**Likely files:** State/evidence and fixes
**Size:** M

### [ ] REL-605: Execute the paused-launch pilot

**Status:** pending
**Description:** Arm Ads creation only for the approved tenant/account, create paused,
read back, separately activate if approved, and monitor.
**Acceptance:** No duplicate resources; plan matches; approval/activation separate;
first spend/measurement/feed observations linked.
**Verification:** Sanitized provider and XeroFlow evidence.
**Dependencies:** REL-604, Phase 4, explicit owner approval
**Likely files:** State/evidence and fixes
**Size:** M

### [ ] REL-606: Observe a complete operational cycle

**Status:** pending
**Description:** Monitor scheduled scans, Merchant freshness, campaign spend/pacing,
conversion delivery and drift through an agreed pilot period.
**Acceptance:** No unresolved critical failures; alerts are actionable/non-noisy;
`validated only` and `proven` states remain distinct.
**Verification:** Monitoring summary and owner acceptance.
**Dependencies:** REL-605
**Likely files:** Evidence/runbook and fixes
**Size:** M

### [ ] REL-607: Close and archive the workstream

**Status:** pending
**Description:** Reconcile every requirement/task, transfer explicitly deferred work,
merge final docs, record deploy state and archive the workstream.
**Acceptance:** No ambiguous open checkbox; deferred items have owner/workstream;
production runbook and marketing pages current; completion accepted.
**Verification:** Final requirement matrix, PR/commit/deploy references and
`gsd-sdk query workstream.complete`.
**Dependencies:** Required rollout outcomes and owner acceptance
**Likely files:** All workstream state plus project documentation
**Size:** S
