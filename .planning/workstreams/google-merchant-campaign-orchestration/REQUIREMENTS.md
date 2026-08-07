# Requirements: Google Merchant and Campaign Orchestration

**PRD:** `PRD.md`
**Status:** Baseline requirements established; Phase 0 evidence pending
**Requirement policy:** A requirement is complete only when its acceptance evidence is
linked from `STATE.md` or the relevant phase verification file.

## Project and authorization

- [ ] **GOV-01:** The production OAuth client ID must be mapped to its Google Cloud
  project ID and project number without storing client secrets in planning artifacts.
- [ ] **GOV-02:** The enabled-service inventory must confirm Merchant API and Google Ads
  API; Data Manager and YouTube must be classified as existing, required, optional or
  absent with an owner-approved reason.
- [ ] **GOV-03:** The Google Ads developer token owner, access level and manager account
  must be recorded in a restricted operational record.
- [ ] **GOV-04:** Merchant developer registration must target the approved agency-level
  Merchant account topology, never an arbitrary client subaccount.
- [ ] **GOV-05:** The verified domain and developer contact used for Merchant
  registration must be agency-controlled and monitored.
- [ ] **GOV-06:** At least one direct/test account and one manager/subaccount path must
  be authorized for read-only validation.
- [ ] **GOV-07:** The concurrent PMax session must be merged or formally abandoned before
  this workstream changes shared launch schemas, state machines or client utilities.
- [ ] **GOV-08:** Merchant reads, Merchant writes, Ads campaign creation and Ads campaign
  activation must have separate feature flags and kill switches.

## Merchant API foundation

- [ ] **MER-01:** All new Merchant integration calls must use
  `merchantapi.googleapis.com`; no new feature may depend on the legacy Content API.
- [ ] **MER-02:** Merchant authentication must reuse encrypted Google credential
  profiles where scopes and account access permit it.
- [ ] **MER-03:** The client must support bounded pagination, abort timeouts, retryable
  backoff and structured redacted diagnostics.
- [ ] **MER-04:** Resource names and raw enum values must be preserved; unsupported or
  missing values must remain unknown rather than defaulting to healthy.
- [ ] **MER-05:** Read-only account and service-link discovery must identify the
  controlling account, merchant/subaccount and accessible roles.
- [ ] **MER-06:** Read-only data-source discovery must expose type, processing state,
  last fetch/upload, schedule, target countries/languages and errors where available.
- [ ] **MER-07:** Product observations must expose aggregate eligible, pending,
  disapproved and issue counts without unnecessarily copying the full catalogue.
- [ ] **MER-08:** Product and account issues must retain provider code, severity,
  affected scope, documentation link where supplied and observation time.
- [ ] **MER-09:** A failed merchant/subaccount must not discard successful observations
  from other accounts in the same run.
- [ ] **MER-10:** Overlapping scans for the same tenant and account must deduplicate.
- [ ] **MER-11:** The existing inventory-feed audit must reach read parity through the
  Merchant API before the legacy endpoint is retired.
- [ ] **MER-12:** Scheduled refreshes must execute through Cloudflare infrastructure,
  not Google Cloud scheduler or functions.

## Commerce readiness

- [ ] **RDY-01:** Readiness must be calculated by versioned deterministic rules.
- [ ] **RDY-02:** The result must distinguish `ready`, `warning`, `blocked`, `unknown`
  and `stale` states.
- [ ] **RDY-03:** Every result must contain evidence, observation time, rule identifier,
  explanation and remediation.
- [ ] **RDY-04:** Missing Ads-Merchant linkage must block retail PMax readiness.
- [ ] **RDY-05:** Missing/failed/stale data sources or zero eligible selected products
  must block readiness.
- [ ] **RDY-06:** Product/account issues must be thresholded by severity and affected
  share; policy-critical issues always block.
- [ ] **RDY-07:** Landing-page domains must be checked against Merchant website/account
  evidence and Google PMax compatibility requirements.
- [ ] **RDY-08:** Budget period, currency, dates, goals and measurement evidence must be
  composed with Merchant readiness without duplicating their source modules.
- [ ] **RDY-09:** The API must provide tenant-scoped list, detail, filtered summary and
  safe export behavior.
- [ ] **RDY-10:** The UI must distinguish never-scanned, empty-success, partial, failed,
  stale and unknown states.
- [ ] **RDY-11:** Merchant readiness must be consumable by the merged PMax preflight as
  structured data, not scraped from UI text.
- [ ] **RDY-12:** Readiness changes must create material events without generating an
  event for freshness-only rescans.

## AI-assisted jobs

- [ ] **JOB-01:** The assistant must operate on a versioned Google campaign-template
  schema with deterministic validation.
- [ ] **JOB-02:** Provider facts, user inputs, defaults and AI inferences must remain
  distinguishable in the proposal.
- [ ] **JOB-03:** The assistant must ask for missing blocking inputs rather than invent
  values.
- [ ] **JOB-04:** Recommendations must include evidence source, freshness, confidence
  and applicability.
- [ ] **JOB-05:** Creating or assigning an internal job/task requires user confirmation
  through the existing propose-confirm-execute pattern.
- [ ] **JOB-06:** Generated tasks must include stable template/rule references,
  dependencies, owners or unassigned state, and due-date rationale.
- [ ] **JOB-07:** The job review must show Merchant, measurement, asset, landing-page,
  targeting and budget readiness together.
- [ ] **JOB-08:** The AI tool surface must not expose direct Merchant or Ads mutations.
- [ ] **JOB-09:** Proposal, acceptance, edits and rejection must be auditable without
  storing hidden chain-of-thought or credentials.
- [ ] **JOB-10:** Accepted proposals must bind to the normalized launch-plan version
  used for approval.

## Google Ads launch integration

- [ ] **ADS-01:** Launch functionality must reuse the merged PMax state machine,
  approval, budget contract, configuration hash and persistence model.
- [ ] **ADS-02:** Fixed-date total budgets must map to `CUSTOM_PERIOD` and
  `totalAmountMicros`; daily pace must never be written as the campaign total.
- [ ] **ADS-03:** Launch approval must be bound to an immutable configuration hash and
  invalidated by material configuration changes.
- [ ] **ADS-04:** Provider validation/preflight must occur before a live mutation where
  supported.
- [ ] **ADS-05:** Every provider mutation sequence must have a stable idempotency key,
  execution claim and resumable phase state.
- [ ] **ADS-06:** PMax resources must be created in provider-required dependency order.
- [ ] **ADS-07:** New campaigns must always be created `PAUSED`.
- [ ] **ADS-08:** Material provider settings and resource names must be read back and
  compared with the approved configuration.
- [ ] **ADS-09:** A mismatch must prevent activation and create a recoverable operator
  state.
- [ ] **ADS-10:** Activation must require a separate approval and command.
- [ ] **ADS-11:** A successful launch must link to existing spend, pacing, conversion
  and Merchant-health monitoring.
- [ ] **ADS-12:** Recovery must pause and reconcile; automated rollback must not delete
  campaigns.

## Controlled Merchant writes

- [ ] **WRT-01:** Merchant writes remain disabled until read-only parity, live-account
  validation and a dedicated write-risk sign-off are complete.
- [ ] **WRT-02:** Each supported write type must have a narrow schema, permission and
  independent feature flag.
- [ ] **WRT-03:** Every write must provide a human-readable preview and deterministic
  validation before approval.
- [ ] **WRT-04:** Approval must bind to the exact target resource and payload hash.
- [ ] **WRT-05:** Every write must be idempotent or protected by an equivalent provider
  reconciliation key.
- [ ] **WRT-06:** Provider state must be read back after mutation and compared with the
  requested result.
- [ ] **WRT-07:** Bulk catalogue rewriting, policy overrides and LLM-directed mutation
  are prohibited.

## Security, tenancy and privacy

- [ ] **SEC-01:** Every endpoint must require authentication, selected tenant and the
  appropriate read/write permission.
- [ ] **SEC-02:** Cross-tenant resource IDs must return 404 without revealing existence.
- [ ] **SEC-03:** Tokens, secrets, developer tokens and full provider error bodies must
  never appear in logs, events or API responses.
- [ ] **SEC-04:** Credential material must use the existing encrypted-profile pattern.
- [ ] **SEC-05:** Account/customer/resource identifiers must be validated before GAQL,
  URL or resource-name interpolation.
- [ ] **SEC-06:** Queue messages must contain references and hashes, not credentials or
  unnecessary product/PII payloads.
- [ ] **SEC-07:** Spreadsheet exports must neutralize formula injection and enforce
  bounded result sizes.
- [ ] **SEC-08:** Audit events must record tenant, actor, action, target, before/after
  summary, provider request reference and timestamp.

## User interface and accessibility

- [ ] **UI-01:** All UI must use Nuxt UI v4 and semantic dark-mode styling.
- [ ] **UI-02:** Any form-touching implementation must first apply the project's
  mandatory frontend-design skill and `UFormField` conventions.
- [ ] **UI-03:** Filters must use non-empty sentinel values.
- [ ] **UI-04:** Readiness tables must use server-side pagination and remain usable on
  mobile, tablet and desktop.
- [ ] **UI-05:** Unknown or stale states must never use success color or wording.
- [ ] **UI-06:** Approval screens must show exact provider-impacting values, not only a
  prose summary.
- [ ] **UI-07:** Keyboard navigation, focus management and screen-reader labels must be
  verified for dialogs, filters and action controls.
- [ ] **UI-08:** Relevant public feature pages and navigation must be updated in the
  same release as the user-facing capability.

## Operations and completion

- [ ] **OPS-01:** Queue depth, scan freshness, failures, retry exhaustion and provider
  read-back mismatches must be observable.
- [ ] **OPS-02:** Scheduled scans and notifications must launch disabled and be enabled
  only after a manual production comparison.
- [ ] **OPS-03:** The rollout must begin with a tenant/account allowlist.
- [ ] **OPS-04:** Database migrations must be additive/idempotent, reviewed end-to-end
  and automatically applied per `AGENTS.md` when implementation begins.
- [ ] **OPS-05:** Each phase requires focused tests, type/lint filtering, build where
  appropriate, security review and documented manual evidence.
- [ ] **OPS-06:** Deployment must use only guarded `pnpm deploy:*` scripts after
  `pnpm deploy:check` passes.
- [ ] **OPS-07:** No phase is complete solely because code is committed; verification,
  deployment state and operational evidence must match its exit criteria.
- [ ] **OPS-08:** The workstream closes only after open follow-ups are moved to a new
  explicitly owned workstream or completed.
