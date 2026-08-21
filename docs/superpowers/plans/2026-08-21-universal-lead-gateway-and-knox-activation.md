# Universal Lead Gateway and Knox Activations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Knox GWM Haval and Knox LDV website leads arrive reliably in XeroFlow, route Knox LDV's five enquiry types to five exact Google conversion actions, activate Knox GWM Haval Meta instant forms, then productise the same provider-neutral capture, reconciliation, health, and end-to-end testing model for every client.

**Architecture:** Browser activity remains PII-minimised candidate evidence. Only an authenticated server receipt, provider API result, native ad-platform delivery, or controlled import creates a canonical lead. Existing intake, submission-intent reconciliation, routing, CRM promotion, measurement outbox, and tracking analytics are extended behind a connector registry; no second lead pipeline is created. Confirmed website leads may carry one bounded enquiry type, and typed Google destinations match that type exactly instead of treating one aggregate `web_conversion` as five conversions.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Nitro/H3, Zod, Neon Postgres, Cloudflare Pages/Workers/Queues, Meta Graph API, Google Ads webhooks, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-universal-lead-gateway-and-knox-activation-design.md`

## Global Constraints

- The primary workspace has another active session with uncommitted lead/tracking work. Do not copy, overwrite, stash, or commit that session's files. Task 0 must pass before any implementation task starts.
- Use the isolated worktree at `.worktrees/universal-lead-gateway` and branch `codex/universal-lead-gateway-design` until the owning session provides a committed integration base.
- Reuse `acceptLead()`, `leadIntakeService`, `lead_submission_intents`, `deriveLeadHealthIssues()`, the existing measurement outbox, and the existing tracking analytics surface after they land. Do not create parallel versions.
- A browser candidate never creates a canonical lead, notification, route, CRM opportunity, or confirmed conversion.
- A canonical test lead must carry `is_test = true` and `test_run_id`; it must be excluded from normal side effects and default reporting.
- Knox LDV is a separate client from Knox GWM Haval. Never reuse a write key, connector secret, Google credential, conversion action, or destination between them.
- Typed conversion routing is fail-closed: a typed event matches only the exact typed mapping; an untyped event matches only an untyped mapping; missing, unknown, or conflicting Knox LDV types create no Google delivery and surface `unmapped_enquiry_type`.
- All public endpoints are origin-enforced, rate-limited, size-bounded, fail-safe where appropriate, and PII-minimised. Canonical PII enters only through authenticated server paths.
- New UI must use Nuxt UI v4. Before modifying any form, load the project-mandated `frontend-design` skill; if its configured path is unavailable, stop that UI task and resolve the skill path instead of silently skipping it.
- Use `~~/server/...` imports from Nitro code. Add runtime types to `app/types/index.ts`, not only `index.d.ts`.
- Allocate migration filenames only after Task 0 by selecting the next collision-free project numbers. The placeholders `<NEXT_MIGRATION>` and `<NEXT_TYPED_ROUTING_MIGRATION>` below are explicit execution-time allocation steps, not permission to guess.
- Every task uses TDD: add a focused failing test, observe the expected failure, implement the smallest complete change, rerun the focused test, then commit atomically.
- Before each commit, reread every changed file, run `git diff --check`, scan for secrets, and apply the AGENTS.md deep-dive checklist.
- Do not deploy until migrations, focused tests, full-suite comparison, and `pnpm deploy:check` pass. Production deployment must use `pnpm deploy:production` only.

---

## Task 0: Reconcile the Other Session and Refresh the Code Graph

**Files:**

- Rebase target: the owning session's committed branch/commit
- Inspect: `public/track.js`
- Inspect: `server/api/public/lead-intent.post.ts`
- Inspect: `server/utils/leads/acceptance.ts`
- Inspect: `server/utils/leads/submissionIntent.ts`
- Inspect: `server/utils/leads/leadHealth.ts`
- Inspect: `server/utils/leads/dealerLeadAdapter.ts`
- Inspect: `server/utils/measurement/contracts.ts`
- Inspect: `server/utils/measurement/outbox.ts`
- Inspect: `server/utils/measurement/destinationRepository.ts`
- Inspect: `workers/measurement-delivery/src/repository.ts`
- Inspect: `app/components/portal/TrackingAnalyticsSection.client.vue`
- Inspect: `server/database/migrations/283_client_lead_capture_mode.sql`
- Inspect: `server/database/migrations/284_lead_reconciliation_and_alerts.sql`
- Inspect: `server/database/migrations/285_lead_submission_intent_reconciliation.sql`
- Create: `docs/superpowers/plans/2026-08-21-universal-lead-gateway-reuse-matrix.md`

- [ ] **Step 1: Confirm the ownership boundary is clean**

  In the primary workspace, require the owning session to provide a commit containing its lead/tracking work. Record the commit SHA. Do not proceed if any relevant file above remains uncommitted.

  Run:

  ```bash
  git -C /Users/paulgiurin/Documents/Projects/dashboard status --short
  git -C /Users/paulgiurin/Documents/Projects/dashboard log -1 --oneline
  ```

  Expected: the relevant lead/tracking paths are absent from `status --short`, and the supplied commit is visible.

- [ ] **Step 2: Rebase the isolated branch**

  Run from the isolated worktree:

  ```bash
  git fetch
  git rebase <OWNING_SESSION_COMMIT>
  ```

  Expected: clean rebase. Resolve only this branch's documentation conflicts; never discard the owning session's implementation.

- [ ] **Step 3: Refresh Graphify from the reconciled tree**

  Run:

  ```bash
  graphify . --update --no-viz
  graphify query "Map lead capture from browser candidate and provider webhooks through canonical intake, routing, CRM promotion, measurement, health, and UI. Identify reusable modules and missing connector/self-test boundaries." --budget 4000
  ```

  Expected: the graph includes the committed `lead-intent`, `acceptance`, `submissionIntent`, `leadHealth`, and tracking analytics files. If Graphify still reports the pre-reconciliation graph, rebuild it before planning code changes.

- [ ] **Step 4: Write the reuse matrix**

  Classify each requested capability as `reuse`, `extend`, or `build` with exact symbols/files. At minimum record:

  | Capability | Classification | Required action |
  |---|---|---|
  | Browser form observation and attribution | Reuse/extend | Extend `public/track.js`; do not add a second tracker |
  | PII-minimised submission intent | Reuse/extend | Add test-run correlation only |
  | Canonical acceptance | Reuse/extend | Centralise test containment in `acceptLead()` |
  | Provider-neutral payload | Reuse/extend | Formalise `dealerLeadAdapter.ts` as `lead.submitted.v1` |
  | Health calculations and alerts | Reuse/extend | Add per-connector states and freshness |
  | Tracking analytics UI | Reuse/extend | Add connector cards and test runner to the existing surface |
  | Connector registry | Build | New durable registry/repository/API |
  | Signed capture test | Build | New run/evidence/token service |
  | Standard Webhooks endpoint | Build | New endpoint; retain legacy generic endpoint |
  | Typed website conversion routing | Build/extend | Add bounded enquiry type to canonical intake, measurement events, and destination mappings; retain untyped compatibility |

- [ ] **Step 5: Establish the reconciled test baseline**

  Run:

  ```bash
  pnpm vitest run \
    test/public/track-tag.test.ts \
    test/server/api/leads/webhook-generic-measurement.test.ts \
    test/server/utils/leads/intake.test.ts \
    test/server/utils/leads/leadCaptureContract.test.ts \
    test/server/utils/leads/submissionIntent.test.ts \
    test/server/utils/leads/leadHealth.test.ts \
    test/server/utils/measurement/outbox.test.ts \
    test/server/utils/measurement/destinationRepository.test.ts \
    test/workers/measurementDeliveryRepository.test.ts
  ```

  Expected: all focused tests pass. Record any reconciled full-suite baseline separately; the earlier observed baseline was 6,363 passing, 36 failing, 4 skipped and must not be assumed after rebase.

- [ ] **Step 6: Commit the reconciliation record**

  ```bash
  git add docs/superpowers/plans/2026-08-21-universal-lead-gateway-reuse-matrix.md
  git commit -m "docs: reconcile universal lead gateway dependencies"
  ```

---

## Task 1: Formalise the Canonical Lead Envelope

**Files:**

- Modify: `server/utils/leads/dealerLeadAdapter.ts`
- Modify: `test/server/utils/leads/dealerLeadAdapter.test.ts`
- Modify: `test/server/utils/leads/leadCaptureContract.test.ts`

- [ ] **Step 1: Write failing contract tests**

  Add fixtures for `lead.submitted.v1` covering customer, vehicle, bounded custom fields, attribution, consent, the optional bounded `enquiryType`, and the discriminated test object:

  ```ts
  test: { isTest: true, runId: crypto.randomUUID() }
  // or
  test: { isTest: false }
  ```

  Assert that caller-supplied client IDs, capture modes, routing flags, and unsigned test status are rejected/ignored. Assert that legacy `schema_version: 1` generic payloads remain valid.

  Add explicit valid values:

  ```ts
  type CanonicalEnquiryType =
    | 'stock'
    | 'finance'
    | 'test_drive'
    | 'contact'
    | 'model_variant'
  ```

  Reject unknown values. Preserve a trusted provider's original form ID/type separately from the normalised enquiry type.

- [ ] **Step 2: Run the tests to verify the red state**

  ```bash
  pnpm vitest run test/server/utils/leads/dealerLeadAdapter.test.ts test/server/utils/leads/leadCaptureContract.test.ts
  ```

  Expected: failures show the versioned event/type, `enquiryType`, and `test.runId` are not yet supported.

- [ ] **Step 3: Implement one internal normalised contract**

  In `dealerLeadAdapter.ts`, export `CanonicalEnquiryTypeSchema`, `CanonicalEnquiryType`, `LeadSubmittedV1Schema`, `LeadSubmittedV1`, and a normaliser that maps both the new envelope and the legacy generic body to the existing `InsertLeadInput` shape. Keep provider-specific external schemas at their ingress adapters. Preserve bounded unknown provider fields under `fields`; do not spread arbitrary keys into trusted metadata. Treat browser-proposed type as candidate metadata only; only authenticated adapters may set the canonical enquiry type used by measurement routing.

  Keep persistence changes out of this task. Task 2 adds `test_run_id` to the database and runtime types only after the migration exists.

- [ ] **Step 4: Run focused tests**

  ```bash
  pnpm vitest run test/server/utils/leads/dealerLeadAdapter.test.ts test/server/utils/leads/leadCaptureContract.test.ts
  ```

  Expected: pass, including legacy compatibility.

- [ ] **Step 5: Commit**

  ```bash
  git add server/utils/leads/dealerLeadAdapter.ts test/server/utils/leads/dealerLeadAdapter.test.ts test/server/utils/leads/leadCaptureContract.test.ts
  git commit -m "feat: formalise canonical lead submission envelope"
  ```

---

## Task 2: Add Connector and Capture-Test Persistence

**Files:**

- Create: `server/database/migrations/<NEXT_MIGRATION>_universal_lead_connectors_and_capture_tests.sql`
- Modify: `server/utils/leads/db.ts`
- Modify: `app/types/index.ts`
- Create: `test/config/universalLeadGatewayMigration.test.ts`

- [ ] **Step 1: Allocate the migration number after reconciliation**

  ```bash
  ls server/database/migrations | sort -V | tail -n 40
  ```

  Expected: choose the next unused numeric prefix and replace `<NEXT_MIGRATION>` everywhere. Do not reuse a prefix added by the other session.

- [ ] **Step 2: Write a failing migration contract test**

  Assert the migration defines:

  - `lead_connectors` with tenant/client ownership, `type`, `provider`, `status`, capabilities, approved origins/form references, secret/credential reference, poll cursor/freshness, last receipt/attempt/error, version, and audit timestamps;
  - `lead_capture_test_runs` with actor, reason, site/connector, origin, one-use token digest, expiry, terminal status, and timestamps;
  - append-only `lead_capture_test_events` with stage, outcome, redacted diagnostics, and occurrence time;
  - nullable `test_run_id` foreign keys on `leads` and `lead_submission_intents`;
  - tenant-safe uniqueness and indexes for receipts, provider IDs, stale connectors, active test runs, and test lead filtering;
  - one-way run transitions and immutable event evidence at the database layer.

- [ ] **Step 3: Verify the red state**

  ```bash
  pnpm vitest run test/config/universalLeadGatewayMigration.test.ts
  ```

  Expected: fail because the migration does not exist.

- [ ] **Step 4: Implement the additive migration**

  Use `IF NOT EXISTS` where safe. Include a public lookup token distinct from the signing secret. Store signing material as an encrypted credential reference (or derive it from a server-held master and store only a digest), never portal-readable plaintext. Connector capabilities are bounded values (`push`, `poll`, `browser_correlation`, `backfill`); canonical authority is explicit (`canonical` or `candidate_only`). Test stages are bounded values from the approved spec.

- [ ] **Step 5: Run the migration contract test**

  ```bash
  pnpm vitest run test/config/universalLeadGatewayMigration.test.ts
  ```

  Expected: pass.

- [ ] **Step 6: Extend runtime persistence types after the schema exists**

  Add `test_run_id?: string | null` to `Lead` in `app/types/index.ts` and to `InsertLeadInput` in `server/utils/leads/db.ts`. Extend the lead insert column list and parameters. Update the migration contract test or a focused DB mock test to prove the value is stored without changing legacy callers.

- [ ] **Step 7: Apply the migration automatically**

  Load the connection string from `.env` and run:

  ```bash
  export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/<NEXT_MIGRATION>_universal_lead_connectors_and_capture_tests.sql
  ```

  Verify with read-only queries for the three tables, two new foreign-key columns, indexes, and triggers.

- [ ] **Step 8: Commit**

  ```bash
  git add server/database/migrations/<NEXT_MIGRATION>_universal_lead_connectors_and_capture_tests.sql server/utils/leads/db.ts app/types/index.ts test/config/universalLeadGatewayMigration.test.ts
  git commit -m "feat: add universal lead connector persistence"
  ```

---

## Task 3: Implement the Connector Registry and Management API

**Files:**

- Create: `server/utils/leads/connectorContracts.ts`
- Create: `server/utils/leads/connectorRepository.ts`
- Create: `server/utils/leads/connectorService.ts`
- Create: `server/api/leads/connectors/index.get.ts`
- Create: `server/api/leads/connectors/index.post.ts`
- Create: `server/api/leads/connectors/[id].patch.ts`
- Create: `server/api/leads/connectors/[id]/rotate.post.ts`
- Modify: `server/api/leads/endpoints/website.post.ts`
- Modify: `server/api/leads/endpoints/list.get.ts`
- Create: `test/server/utils/leads/connectorService.test.ts`
- Create: `test/server/api/leads/connectors.test.ts`

- [ ] **Step 1: Write failing service and API tests**

  Cover tenant isolation, role/write access, connector capability validation, status transitions, optimistic version conflicts, copy-once secret provisioning, audited rotation with grace period, and redacted list responses. Assert legacy website endpoint provisioning creates or links a `first_party_gateway` connector instead of creating another credential.

- [ ] **Step 2: Verify the red state**

  ```bash
  pnpm vitest run test/server/utils/leads/connectorService.test.ts test/server/api/leads/connectors.test.ts
  ```

- [ ] **Step 3: Implement contracts, repository, and service**

  Supported initial types:

  ```ts
  type LeadConnectorType =
    | 'first_party_gateway'
    | 'provider_webhook'
    | 'provider_poll'
    | 'meta_lead_ads'
    | 'google_lead_form'
    | 'controlled_import'
    | 'browser_candidate'
  ```

  Use one authoritative service for creation/rotation/state transitions. Return a secret only on creation/rotation. Return `credentialConfigured: boolean` thereafter.

- [ ] **Step 4: Bridge the legacy endpoint APIs**

  Keep `/api/leads/endpoints/website` and existing Google endpoint behaviour compatible, but make connector records their common health/config representation. Do not expose Google keys through new lower-privileged payloads.

- [ ] **Step 5: Run focused tests**

  ```bash
  pnpm vitest run test/server/utils/leads/connectorService.test.ts test/server/api/leads/connectors.test.ts test/server/api/leads/webhook-generic-measurement.test.ts test/server/api/leads/webhook-google.test.ts
  ```

  Expected: pass with legacy routes unchanged externally.

- [ ] **Step 6: Commit**

  ```bash
  git add server/utils/leads/connectorContracts.ts server/utils/leads/connectorRepository.ts server/utils/leads/connectorService.ts server/api/leads/connectors server/api/leads/endpoints/website.post.ts server/api/leads/endpoints/list.get.ts test/server/utils/leads/connectorService.test.ts test/server/api/leads/connectors.test.ts
  git commit -m "feat: add universal lead connector registry"
  ```

---

## Task 4: Add the Standard Webhooks Canonical Ingress

**Files:**

- Create: `server/utils/leads/standardWebhook.ts`
- Create: `server/api/leads/webhook/standard/[token].post.ts`
- Modify: `server/utils/leads/acceptance.ts`
- Create: `test/server/utils/leads/standardWebhook.test.ts`
- Create: `test/server/api/leads/webhook-standard.test.ts`

- [ ] **Step 1: Write failing security and ingestion tests**

  Cover exact raw-body signing, `webhook-id`, `webhook-timestamp`, multi-signature `webhook-signature`, replay-window rejection, constant-time verification, active/previous secret overlap, request size limit, JSON/schema rejection, tenant-bound token lookup, idempotency, duplicate receipt response, and redacted diagnostics. Include a valid `lead.submitted.v1` fixture that reaches the existing `acceptLead()` path once.

- [ ] **Step 2: Verify the red state**

  ```bash
  pnpm vitest run test/server/utils/leads/standardWebhook.test.ts test/server/api/leads/webhook-standard.test.ts
  ```

- [ ] **Step 3: Implement signing verification**

  Verify the signature over the exact bytes before JSON parsing. Use a bounded timestamp tolerance and constant-time comparisons. Persist/reuse `webhook-id` as the immutable source receipt ID. Return meaningful retryable status codes for transport/server failure and terminal 4xx for invalid auth/schema; do not copy the legacy generic route's always-200 behaviour into this new protocol.

- [ ] **Step 4: Implement canonical ingestion**

  Resolve client, source authority, test authority, and connector server-side. Normalise the envelope and call `acceptLead()`. Update connector receipt timestamps and error class without storing raw PII diagnostics.

- [ ] **Step 5: Run focused tests**

  ```bash
  pnpm vitest run test/server/utils/leads/standardWebhook.test.ts test/server/api/leads/webhook-standard.test.ts test/server/utils/leads/intake.test.ts
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add server/utils/leads/standardWebhook.ts server/api/leads/webhook/standard server/utils/leads/acceptance.ts test/server/utils/leads/standardWebhook.test.ts test/server/api/leads/webhook-standard.test.ts
  git commit -m "feat: add signed canonical lead webhook"
  ```

---

## Task 5: Build the Signed End-to-End Capture Test Service

**Files:**

- Create: `server/utils/leads/captureTestContracts.ts`
- Create: `server/utils/leads/captureTestRepository.ts`
- Create: `server/utils/leads/captureTestService.ts`
- Create: `server/api/leads/capture-tests/index.post.ts`
- Create: `server/api/leads/capture-tests/[id].get.ts`
- Create: `server/api/public/lead-capture-test/verify.post.ts`
- Create: `server/api/public/lead-capture-test/evidence.post.ts`
- Create: `test/server/utils/leads/captureTestService.test.ts`
- Create: `test/server/api/leads/capture-tests.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

  Test authorised creation, required human reason, 15-minute expiry, origin/site/connector binding, one-use bootstrap-token exchange, digest-only token storage, terminal pass/fail/timeout, append-only evidence, duplicate stage idempotency, invalid stage order, redaction, tenant isolation, and inability of a public token to create or read a non-test lead.

- [ ] **Step 2: Verify the red state**

  ```bash
  pnpm vitest run test/server/utils/leads/captureTestService.test.ts test/server/api/leads/capture-tests.test.ts
  ```

- [ ] **Step 3: Implement repository and service**

  Use stages:

  ```ts
  type LeadCaptureTestStage =
    | 'tracker_loaded'
    | 'candidate_created'
    | 'provider_success_observed'
    | 'trusted_receipt_accepted'
    | 'candidate_reconciled'
    | 'canonical_test_lead_stored'
    | 'destinations_validated'
  ```

  Each event records `passed`, `failed`, or `skipped` plus a bounded redacted diagnostic. Determine the overall status from expected stages; never infer success solely from a browser signal.

- [ ] **Step 4: Implement authenticated and public APIs**

  The authenticated create API returns the one-time URL/bootstrap token and run metadata. The public verify API atomically consumes that bootstrap token and exchanges it for an origin-bound, run-scoped evidence token valid only until the same 15-minute expiry. The evidence API accepts the scoped token for multiple stage writes but cannot create/read leads or change connector configuration. Neither API reveals client secrets or lead contents. Enforce request size, rate, origin, expiry, and token scope.

- [ ] **Step 5: Run focused tests**

  ```bash
  pnpm vitest run test/server/utils/leads/captureTestService.test.ts test/server/api/leads/capture-tests.test.ts
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add server/utils/leads/captureTestContracts.ts server/utils/leads/captureTestRepository.ts server/utils/leads/captureTestService.ts server/api/leads/capture-tests server/api/public/lead-capture-test test/server/utils/leads/captureTestService.test.ts test/server/api/leads/capture-tests.test.ts
  git commit -m "feat: add signed lead capture test lifecycle"
  ```

---

## Task 6: Correlate Browser Test Evidence Without Promoting Candidates

**Files:**

- Modify: `public/track.js`
- Modify: `server/utils/leads/submissionIntent.ts`
- Modify: `server/api/public/lead-intent.post.ts`
- Modify: `test/public/track-tag.test.ts`
- Modify: `test/server/utils/leads/submissionIntent.test.ts`
- Create: `test/server/api/publicLeadCaptureTest.test.ts`

- [ ] **Step 1: Write failing browser/candidate tests**

  Assert a valid signed run can add only `test_run_id` and emit `tracker_loaded`, `candidate_created`, and `provider_success_observed`. Assert an invalid/expired/wrong-origin token changes nothing. Assert `captureLeadContext()` returns correlation and attribution only, never raw form values. Assert arbitrary `fetch`/XHR bodies are not patched or exfiltrated.

- [ ] **Step 2: Verify the red state**

  ```bash
  pnpm vitest run test/public/track-tag.test.ts test/server/utils/leads/submissionIntent.test.ts test/server/api/publicLeadCaptureTest.test.ts
  ```

- [ ] **Step 3: Extend the existing tracker**

  Add a short-lived test context activated only after server verification. Extend the existing `window.xf.captureLeadContext()` return value and named `xf_lead_confirmed` data-layer listener with `test_run_id` and detection method. Keep all requests non-blocking and fail-safe. Traditional submit/formdata detection remains candidate-only.

- [ ] **Step 4: Persist candidate correlation**

  Extend `SubmissionIntentSchema` and `storeSubmissionIntent()` to accept a verified `test_run_id` supplied by server-resolved test context, not an arbitrary caller value. Record the matching test stage after storage.

- [ ] **Step 5: Run focused tests**

  ```bash
  pnpm vitest run test/public/track-tag.test.ts test/server/utils/leads/submissionIntent.test.ts test/server/api/publicLeadCaptureTest.test.ts
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add public/track.js server/utils/leads/submissionIntent.ts server/api/public/lead-intent.post.ts test/public/track-tag.test.ts test/server/utils/leads/submissionIntent.test.ts test/server/api/publicLeadCaptureTest.test.ts
  git commit -m "feat: correlate signed browser lead tests"
  ```

---

## Task 7: Contain Synthetic Leads Across Every Side Effect

**Files:**

- Modify: `server/utils/leads/acceptance.ts`
- Modify: `server/utils/leads/intake.ts`
- Modify: `server/utils/leads/db.ts`
- Modify: `server/utils/leads/dispatch.ts`
- Modify: `server/utils/leads/notifyOnNew.ts`
- Modify: `server/utils/leads/crmPromotion.ts`
- Modify: `server/utils/measurement/publisher.ts`
- Modify: `server/api/leads/list.get.ts`
- Modify: `server/utils/leads/portalAnalytics.ts`
- Create: `test/server/utils/leads/testContainment.test.ts`
- Modify: `test/server/utils/leads/intake.test.ts`
- Modify: `test/server/utils/leads/dispatch-crm-promotion.test.ts`
- Modify: `test/server/api/portalAnalyticsLeads.test.ts`

- [ ] **Step 1: Write a failing containment matrix**

  For `is_test=true, test_run_id=<run>`, assert:

  - canonical lead row is stored once;
  - submission intent may reconcile;
  - normal rule evaluation/destination dispatch is skipped;
  - staff notification and CRM timeline bridge are skipped;
  - CRM promotion is skipped;
  - confirmed conversion outbox delivery is skipped unless an explicit provider validate-only stage handles it;
  - default inbox, portal metrics, response-time metrics, and conversion counts exclude it;
  - authorised test-run and `include_test=true` views can retrieve it.

- [ ] **Step 2: Verify the red state**

  ```bash
  pnpm vitest run test/server/utils/leads/testContainment.test.ts test/server/utils/leads/intake.test.ts test/server/utils/leads/dispatch-crm-promotion.test.ts test/server/api/portalAnalyticsLeads.test.ts
  ```

- [ ] **Step 3: Centralise the policy in `acceptLead()`**

  Do not rely on every ingress route remembering flags. Validate the run belongs to the same client/connector and is active, store `is_test`/`test_run_id`, record canonical test stages, and suppress normal side effects in this single acceptance boundary. Keep defensive skips in dispatch/notify/CRM as a second barrier.

- [ ] **Step 4: Separate provider validation from normal conversion delivery**

  Reuse `providerTestService.ts` for Meta test events and Google validate-only calls. Link its redacted result into capture-test evidence; do not enqueue a normal measurement event for a synthetic lead.

- [ ] **Step 5: Run focused tests**

  ```bash
  pnpm vitest run test/server/utils/leads/testContainment.test.ts test/server/utils/leads/intake.test.ts test/server/utils/leads/dispatch-crm-promotion.test.ts test/server/api/portalAnalyticsLeads.test.ts test/server/utils/measurement/providerTestService.test.ts
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add server/utils/leads/acceptance.ts server/utils/leads/intake.ts server/utils/leads/db.ts server/utils/leads/dispatch.ts server/utils/leads/notifyOnNew.ts server/utils/leads/crmPromotion.ts server/utils/measurement/publisher.ts server/api/leads/list.get.ts server/utils/leads/portalAnalytics.ts test/server/utils/leads/testContainment.test.ts test/server/utils/leads/intake.test.ts test/server/utils/leads/dispatch-crm-promotion.test.ts test/server/api/portalAnalyticsLeads.test.ts
  git commit -m "feat: contain synthetic leads end to end"
  ```

---

## Task 8: Add Exact Enquiry-Type Conversion Routing

**Files:**

- Create: `server/database/migrations/<NEXT_TYPED_ROUTING_MIGRATION>_typed_website_conversion_routing.sql`
- Modify: `server/utils/leads/dealerLeadAdapter.ts`
- Modify: `server/utils/leads/acceptance.ts`
- Modify: `server/utils/measurement/contracts.ts`
- Modify: `server/utils/measurement/publisher.ts`
- Modify: `server/utils/measurement/outbox.ts`
- Modify: `server/utils/measurement/destinationRepository.ts`
- Modify: `server/api/agency/measurement/clients/[clientId]/destinations/index.post.ts`
- Create: `server/api/agency/measurement/clients/[clientId]/destinations/[destinationId].patch.ts`
- Modify: `workers/measurement-delivery/src/repository.ts`
- Modify: `app/components/clients/ClientMeasurementDestinationEditor.vue`
- Modify: `app/components/clients/ClientMeasurementPanel.vue`
- Modify: `app/types/index.ts`
- Modify: `test/server/utils/measurement/contracts.test.ts`
- Modify: `test/server/utils/measurement/outbox.test.ts`
- Modify: `test/server/utils/measurement/destinationRepository.test.ts`
- Modify: `test/workers/measurementDeliveryRepository.test.ts`
- Modify: `test/app/clientMeasurementDestinationEditor.test.ts`
- Create: `test/config/typedWebsiteConversionRoutingMigration.test.ts`

**Required skill before UI action:** project-mandated `frontend-design` skill for the destination form.

- [ ] **Step 1: Write the failing migration and routing tests**

  Require a nullable, bounded `enquiry_type` on canonical leads, conversion events, and event mappings. The only allowed values are `stock`, `finance`, `test_drive`, `contact`, and `model_variant`. Assert exact matching in both directions: a typed event matches only the same typed mapping, and an untyped event matches only a null mapping. A missing, unknown, or conflicting type must create zero delivery rows and surface `unmapped_enquiry_type`; there is no wildcard fallback.

  Add compatibility tests proving existing untyped clients still emit their existing v1 idempotency keys and route only to existing untyped mappings. A repeated idempotency key with a conflicting enquiry type must be rejected instead of silently changing identity.

- [ ] **Step 2: Verify the red state**

  ```bash
  pnpm vitest run test/config/typedWebsiteConversionRoutingMigration.test.ts test/server/utils/measurement/contracts.test.ts test/server/utils/measurement/outbox.test.ts test/server/utils/measurement/destinationRepository.test.ts test/workers/measurementDeliveryRepository.test.ts
  ```

- [ ] **Step 3: Add the bounded persistence model and apply it**

  Add nullable columns plus database `CHECK` constraints and indexes. Preserve all existing rows as untyped. Use the next free migration number after the Task 0 rebase, replace the placeholder in this plan with that exact number, then automatically apply the migration to the configured Neon database as required by the project runbook.

- [ ] **Step 4: Propagate only trusted canonical type**

  Carry `CanonicalEnquiryType | null` from the authenticated provider adapter through `acceptLead()` and the measurement publisher into the conversion event. Browser-proposed form/type values remain candidate evidence and cannot select a live destination. Keep the provider's original form name/ID as separate diagnostic metadata.

- [ ] **Step 5: Make mapping expansion exact and fail-closed**

  Extend destination mapping create/update contracts and the outbox expansion query with exact nullable equality. Store `unmapped_enquiry_type` as redacted operational evidence when a typed accepted lead has no exact mapping. Do not change the Google Data Manager provider payload or delivery retry semantics.

- [ ] **Step 6: Update the destination editor**

  Load `frontend-design`, then add an optional enquiry-type selector using `UFormField` and `USelectMenu`. Prevent an aggregate and typed mapping for the same destination/event combination from coexisting. Keep untyped as the default for existing clients.

- [ ] **Step 7: Run focused tests and commit**

  ```bash
  pnpm vitest run test/config/typedWebsiteConversionRoutingMigration.test.ts test/server/utils/measurement/contracts.test.ts test/server/utils/measurement/outbox.test.ts test/server/utils/measurement/destinationRepository.test.ts test/workers/measurementDeliveryRepository.test.ts test/app/clientMeasurementDestinationEditor.test.ts
  git add server/database/migrations/<EXACT_MIGRATION>_typed_website_conversion_routing.sql server/utils/leads/dealerLeadAdapter.ts server/utils/leads/acceptance.ts server/utils/measurement/contracts.ts server/utils/measurement/publisher.ts server/utils/measurement/outbox.ts server/utils/measurement/destinationRepository.ts server/api/agency/measurement/clients/'[clientId]'/destinations/index.post.ts server/api/agency/measurement/clients/'[clientId]'/destinations/'[destinationId]'.patch.ts workers/measurement-delivery/src/repository.ts app/components/clients/ClientMeasurementDestinationEditor.vue app/components/clients/ClientMeasurementPanel.vue app/types/index.ts test/config/typedWebsiteConversionRoutingMigration.test.ts test/server/utils/measurement/contracts.test.ts test/server/utils/measurement/outbox.test.ts test/server/utils/measurement/destinationRepository.test.ts test/workers/measurementDeliveryRepository.test.ts test/app/clientMeasurementDestinationEditor.test.ts
  git commit -m "feat: route typed website conversions exactly"
  ```

---

## Task 9: Add Per-Connector Health and Sustained Alerts

**Files:**

- Modify: `server/utils/leads/leadHealth.ts`
- Modify: `server/api/cron/lead-integration-health.post.ts`
- Create: `server/api/leads/connectors/health.get.ts`
- Modify: `server/api/portal/analytics/tracking/health.get.ts`
- Modify: `test/server/utils/leads/leadHealth.test.ts`
- Create: `test/server/api/leads/connectorHealth.test.ts`

- [ ] **Step 1: Write failing health-state tests**

  Cover `tracking_missing`, `capture_not_connected`, `receipt_stale`, `browser_link_missing`, `poll_stale`, `auth_failed`, `destination_failed`, and `healthy`. Specifically assert that healthy browser traffic plus zero canonical connector is `capture_not_connected`, not `tracking_missing`. Assert test events do not affect production freshness.

- [ ] **Step 2: Verify the red state**

  ```bash
  pnpm vitest run test/server/utils/leads/leadHealth.test.ts test/server/api/leads/connectorHealth.test.ts
  ```

- [ ] **Step 3: Extend the existing health snapshot**

  Add connector capabilities, authority, last receipt/attempt/poll, cursor age, duplicate/replay counts, candidate-to-lead reconciliation, browser attribution coverage, and the latest capture-test summary. Keep the existing aggregate fields for compatibility.

- [ ] **Step 4: Harden alert transitions**

  Extend the existing `lead_integration_alert_state` flow to notify only after the configured sustained breach and then only on transition or cooldown. Backfill/baseline current connector states before enabling alerts so Knox and other known gaps do not create a flood.

- [ ] **Step 5: Run focused tests**

  ```bash
  pnpm vitest run test/server/utils/leads/leadHealth.test.ts test/server/api/leads/connectorHealth.test.ts
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add server/utils/leads/leadHealth.ts server/api/cron/lead-integration-health.post.ts server/api/leads/connectors/health.get.ts server/api/portal/analytics/tracking/health.get.ts test/server/utils/leads/leadHealth.test.ts test/server/api/leads/connectorHealth.test.ts
  git commit -m "feat: expose universal lead connector health"
  ```

---

## Task 10: Build Connector Cards and the End-to-End Test UI

**Required skill before action:** project-mandated `frontend-design` skill for all form work.

**Files:**

- Create: `app/components/tracking/LeadConnectorCard.vue`
- Create: `app/components/tracking/LeadCaptureTestSlideover.vue`
- Create: `app/components/tracking/LeadConnectorPanel.vue`
- Modify: `app/components/portal/TrackingAnalyticsSection.client.vue`
- Modify: `app/pages/agency/tracking/[clientId].vue`
- Modify: `app/types/index.ts`
- Create: `test/app/leadConnectorPanel.test.ts`
- Create: `test/app/leadCaptureTestSlideover.test.ts`

- [ ] **Step 1: Load the frontend design instructions**

  Read the configured frontend-design `SKILL.md` in full before editing a form. Record the resolved path in the task notes.

- [ ] **Step 2: Write failing component contract tests**

  Assert capability/freshness badges, candidate-versus-confirmed explanation, remediation guidance, copy-once secret state, rotation confirmation using `UModal`, and the staged test runner. Assert every field uses `UFormField` plus Nuxt UI controls and that no browser-native dialog/input/select/button is introduced.

- [ ] **Step 3: Verify the red state**

  ```bash
  pnpm vitest run test/app/leadConnectorPanel.test.ts test/app/leadCaptureTestSlideover.test.ts
  ```

- [ ] **Step 4: Implement the existing-surface extension**

  Add the connector panel to the current tracking analytics health area, not a separate tracking product. Use `UCard`, `UBadge`, `UAlert`, `USlideover`, `UModal`, `UFormField`, `UInput`, `USelectMenu`, `UTextarea`, and `UButton`. Use `@container` and container breakpoints inside constrained surfaces. Poll the run-status endpoint only while a test is active, then stop.

- [ ] **Step 5: Run focused tests and typecheck affected code**

  ```bash
  pnpm vitest run test/app/leadConnectorPanel.test.ts test/app/leadCaptureTestSlideover.test.ts
  pnpm run typecheck
  ```

  Expected: new tests pass; typecheck introduces no new errors beyond the recorded project baseline.

- [ ] **Step 6: Commit**

  ```bash
  git add app/components/tracking/LeadConnectorCard.vue app/components/tracking/LeadCaptureTestSlideover.vue app/components/tracking/LeadConnectorPanel.vue app/components/portal/TrackingAnalyticsSection.client.vue app/pages/agency/tracking/'[clientId].vue' app/types/index.ts test/app/leadConnectorPanel.test.ts test/app/leadCaptureTestSlideover.test.ts
  git commit -m "feat: add lead connector health and test UI"
  ```

---

## Task 11: Activate Knox GWM Haval Website Lead Delivery

**Files:**

- Create: `docs/integrations/knox-gwm-haval-lead-capture.md`
- Modify only if required by the chosen provider path: a scoped adapter under `server/utils/leads/providers/`
- Add fixture/test only if a new adapter is required

- [ ] **Step 1: Resolve Knox's production identifiers read-only**

  Record the Knox XeroFlow client ID, tracking site ID, approved origin `https://www.knoxgwmhaval.com.au`, existing endpoint rows, connector rows, capture mode, relevant form/provider IDs, and current 90-day counts. Do not log credentials or raw customer data.

- [ ] **Step 2: Provision or link the Knox first-party connector**

  Use the authenticated XeroFlow endpoint/connector API. Ensure it has a dedicated rotatable secret and canonical authority. Never reuse the Google webhook credential.

- [ ] **Step 3: Inspect Dealer Studio through an authenticated browser**

  Follow the required priority order:

  1. configure a confirmed-lead webhook to the XeroFlow endpoint;
  2. if unavailable, configure a fixed-host authenticated polling adapter with cursor, overlap, and provider-ID deduplication;
  3. if backend control exists, post to a durable XeroFlow-first relay before asynchronous provider/CRM delivery;
  4. otherwise install only an explicit success/data-layer bridge and keep connector authority `candidate_only`.

  Before saving an external configuration, inspect the final URL, client mapping, event scope, and payload field mapping. The user has authorised Knox activation, but no unrelated Dealer Studio setting changes.

- [ ] **Step 4: Forward browser correlation at the real success boundary**

  Call `window.xf.captureLeadContext()` only after the provider confirms success. Forward `zeroflow_browser_event_id`, first/last-touch fields, and signed `test_run_id` through the trusted receipt. Emit `xf_lead_confirmed` without customer PII.

- [ ] **Step 5: Run the signed synthetic test**

  Use the approved mock identity and require these stages to pass: tracker loaded, candidate created, provider success, trusted receipt, candidate reconciled, canonical test lead stored. Confirm the test lead is hidden by default and caused no routing, notification, CRM promotion, or normal conversion.

- [ ] **Step 6: Run one authorised production enquiry**

  Only after the synthetic test passes, submit one clearly identified live enquiry. Verify exactly one Knox inbox lead, correct form/source/provider, browser event correlation, first/last-touch attribution, expected rule delivery, and confirmed measurement outbox evidence.

- [ ] **Step 7: Document and commit the runbook**

  Include configuration ownership, rotation steps, failure mode, rollback, test procedure, health thresholds, and screenshots/IDs with all secrets and PII redacted.

  ```bash
  git add docs/integrations/knox-gwm-haval-lead-capture.md
  git commit -m "docs: activate Knox website lead capture"
  ```

  If a provider adapter was required, add its exact implementation and test paths explicitly before the commit; do not stage a broad directory.

---

## Task 12: Activate and Backfill Knox GWM Haval Meta Instant Forms

**Files:**

- Modify if required: `server/api/leads/webhook/meta.post.ts`
- Modify if required: `server/api/leads/_internal/meta-backfill.post.ts`
- Modify if required: `server/utils/leads/normalizer.ts`
- Modify if required: `test/social/metaWebhook.test.ts`
- Create: `test/server/api/leads/metaBackfill.test.ts` if missing
- Update: `docs/integrations/knox-gwm-haval-lead-capture.md`

- [ ] **Step 1: Verify Meta capability and mappings read-only**

  Confirm the Knox Facebook Page, ad account, current app approval, granted `leads_retrieval` scope, Page `leadgen` subscription, XeroFlow client mapping, and every Knox instant-form ID, including `1312614543825266`. Do not claim real-time ingestion if App Review/scope is still gated.

- [ ] **Step 2: Write adapter/backfill tests only for observed gaps**

  Cover unmapped form health, Meta lead-ID deduplication, overlap-window backfill, cursor/page handling, expired token, and `is_test` propagation. Reuse existing webhook/backfill code when it already satisfies a case.

- [ ] **Step 3: Connect the Page when authorised capability exists**

  Subscribe the approved app/Page to `leadgen`, map all Knox forms to the Knox client, and verify the webhook challenge/receipt. If `leads_retrieval` is unavailable, record the connector as `auth_failed`/`gated`, use the existing CSV importer as the declared interim path, and stop before fabricating success.

- [ ] **Step 4: Backfill recent recoverable leads**

  Run Graph API backfill with a documented overlap window. Verify counts against the source sheet/Lead Center and prove rerunning the same window creates zero duplicates.

- [ ] **Step 5: Send one Meta test lead**

  Verify a canonical Knox `is_test` lead, correct form mapping, no normal side effects, and healthy Meta connector evidence. Then enable normal routing and verify only post-test production leads are eligible.

- [ ] **Step 6: Run focused tests and commit any code/docs changes**

  ```bash
  pnpm vitest run test/social/metaWebhook.test.ts test/server/api/leads/metaBackfill.test.ts
  git add server/api/leads/webhook/meta.post.ts server/api/leads/_internal/meta-backfill.post.ts server/utils/leads/normalizer.ts test/social/metaWebhook.test.ts test/server/api/leads/metaBackfill.test.ts docs/integrations/knox-gwm-haval-lead-capture.md
  git commit -m "feat: activate Knox Meta lead forms"
  ```

  If no code change was required, commit only the redacted operational runbook update.

---

## Task 13: Activate Knox LDV Pixel and Trusted Website Capture

**Files:**

- Create: `docs/integrations/knox-ldv-lead-capture.md`
- Modify only if required by the observed Dealer Studio receipt: a scoped adapter under `server/utils/leads/providers/`
- Add the exact provider fixture/test path only if a new adapter is required

- [ ] **Step 1: Create a separate Knox LDV tenant configuration**

  Through authenticated XeroFlow APIs, create or resolve the distinct `Knox LDV` client, then create its own tracking site for `https://www.knoxldv.com.au` with both canonical and `www` origins as observed, SPA navigation enabled, and a newly generated write key. Confirm no Knox GWM Haval key, connector, destination, or credential is reused.

- [ ] **Step 2: Install the existing XeroFlow tracker through the existing GTM container**

  In authenticated Google Tag Manager container `GTM-NNPZDBQB`, add one All Pages XeroFlow tracker tag using the Knox LDV write key. Preview first and inspect the final container/workspace/tag before publishing. Verify on desktop and mobile that exactly one tracker instance loads, page views and SPA routes are not duplicated, click IDs are captured with consent, and no form PII enters browser tracking events.

- [ ] **Step 3: Establish the trusted Dealer Studio receipt**

  Inspect the authenticated Dealer Studio integration surface and use this priority: confirmed-lead webhook, fixed-host authenticated polling with cursor/deduplication, XeroFlow-first relay, then success callback/data-layer bridge as candidate evidence only. Provision a Knox-LDV-only rotatable connector secret. Map each observed provider form identifier to exactly one canonical enquiry type; do not infer type from arbitrary free text.

- [ ] **Step 4: Attach browser attribution at provider success**

  Call `window.xf.captureLeadContext()` only at the confirmed success boundary, carry the browser event ID and first/last-touch fields through the trusted receipt, and emit the PII-free `xf_lead_confirmed` event. Ensure failed/abandoned submissions never create canonical leads or conversions.

- [ ] **Step 5: Run five contained synthetic journeys**

  Run one signed test for Stock, Finance, Test Drive, Contact Us, and Model Variant. Require one candidate, one trusted receipt, one canonical `is_test` lead, correct exact enquiry type, and zero normal routing/notification/CRM/conversion side effects. Correct any form-specific mapping before Google activation.

- [ ] **Step 6: Document and commit**

  Record redacted client/site/connector/tag IDs, origin rules, GTM publish version, provider mapping, rotation and rollback steps, and evidence timestamps.

  ```bash
  git add docs/integrations/knox-ldv-lead-capture.md
  git commit -m "docs: activate Knox LDV website tracking"
  ```

---

## Task 14: Connect Knox LDV Google Ads and Activate Five Exact Conversions

**Files:**

- Modify: `server/utils/googleConversionActions.ts`
- Create: `server/api/agency/measurement/clients/[clientId]/google-conversion-actions.post.ts`
- Modify: `test/server/utils/googleConversionActions.test.ts`
- Create: `test/server/api/googleMeasurementConversionActionCreate.test.ts`
- Update: `docs/integrations/knox-ldv-lead-capture.md`

- [ ] **Step 1: Connect and verify the exact Google Ads customer**

  Use the existing OAuth flow and its `adwords` plus `datamanager` scopes. Connect customer `389-217-6492` to the Knox LDV client, using its observed manager/login customer ID when applicable. Verify account name, currency, timezone, scopes, tenant mapping, and active refresh grant before any mutation.

- [ ] **Step 2: Discover actions before creating anything**

  Use the existing conversion-action discovery API to list enabled `UPLOAD_CLICKS`/`WEBPAGE` actions. Match names exactly after normalising whitespace only. Reuse an exact existing action and never create a duplicate by name.

- [ ] **Step 3: Add an idempotent, tenant-scoped creation path for missing actions**

  Write failing tests, then add a configure-authorised POST endpoint backed by Google Ads API v23 `conversionActions:mutate`. Accept only the five approved names, create a compatible lead conversion action with explicit category/origin/count/value settings, and return only redacted IDs/status. Re-query after mutation and fail closed on ambiguous or duplicate results. Do not expose refresh/access tokens.

  Approved names and mappings:

  | Enquiry type | Google conversion action |
  |---|---|
  | `stock` | `Stock Enquiry` |
  | `finance` | `Finance Enquiry` |
  | `test_drive` | `Test Drive Enquiry` |
  | `contact` | `Contact Us` |
  | `model_variant` | `Model Variant Enquiry` |

- [ ] **Step 4: Create five exact XeroFlow destination mappings**

  Create one Google Data Manager destination/mapping per action and enquiry type. Do not create an untyped Knox LDV `web_conversion` mapping. Assert database uniqueness and inspect the final client, connection, action ID, type, consent mode, and management origin before activation.

- [ ] **Step 5: Validate without recording conversions**

  Run the existing provider test service with `validateOnly=true` against all five actions. Also prove an unknown type, a missing type, and each of the four non-matching types produce zero delivery for a selected action. Record only redacted request/diagnostic IDs.

- [ ] **Step 6: Activate and verify one production journey per type**

  After the trusted receipt and validate-only matrix pass, activate the destinations. A real production form submission is an external side effect: inspect the final form and payload and use only an operator-approved test identity. Verify each accepted lead creates exactly one outbox delivery to its matching action and zero deliveries to the other four.

- [ ] **Step 7: Run tests and commit code/runbook**

  ```bash
  pnpm vitest run test/server/utils/googleConversionActions.test.ts test/server/api/googleMeasurementConversionActionCreate.test.ts test/server/utils/measurement/providerTestService.test.ts
  git add server/utils/googleConversionActions.ts server/api/agency/measurement/clients/'[clientId]'/google-conversion-actions.post.ts test/server/utils/googleConversionActions.test.ts test/server/api/googleMeasurementConversionActionCreate.test.ts docs/integrations/knox-ldv-lead-capture.md
  git commit -m "feat: activate Knox LDV Google conversions"
  ```

---

## Task 15: Update Product Documentation and Marketing Pages

**Files:**

- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Review: `app/components/MarketingNav.vue`
- Modify: `app/components/leads/SetupGuide.vue`
- Create: `docs/integrations/universal-lead-gateway.md`
- Create: `test/app/universalLeadGatewayMarketing.test.ts`

- [ ] **Step 1: Write a failing marketing/docs contract test**

  Assert the existing `lead-capture-routing` feature describes website/provider connectors, native Meta/Google capture, candidate-versus-confirmed semantics, signed end-to-end tests, XeroFlow capture without an external CRM, and connector health. Assert the feature remains present in the existing marketing navigation.

- [ ] **Step 2: Verify the red state**

  ```bash
  pnpm vitest run test/app/universalLeadGatewayMarketing.test.ts
  ```

- [ ] **Step 3: Update the existing public feature entry**

  Extend, do not duplicate, `lead-capture-routing` in the feature index and detail page with 3–4 current sections. Update the existing nav subtitle only if needed; no new top-level nav category is required because Lead Capture & Routing is already present. Preserve light/dark variants on every hardcoded marketing colour.

- [ ] **Step 4: Update the in-product setup guide and operator runbook**

  Replace ambiguous “generic pixel captures leads” language with the trusted receipt model. Document Standard Webhooks headers, legacy endpoint compatibility, copy-once secrets, first-party relay, provider polling constraints, native Meta separation, self-test containment, and troubleshooting states.

- [ ] **Step 5: Run tests and commit**

  ```bash
  pnpm vitest run test/app/universalLeadGatewayMarketing.test.ts
  git add app/pages/features/index.vue app/pages/features/'[slug].vue' app/components/MarketingNav.vue app/components/leads/SetupGuide.vue docs/integrations/universal-lead-gateway.md test/app/universalLeadGatewayMarketing.test.ts
  git commit -m "docs: publish universal lead capture guidance"
  ```

---

## Task 16: Battle-Test, Deploy, and Verify Production

**Files:**

- Review: every file changed by Tasks 1–15
- Update if required: `docs/integrations/knox-gwm-haval-lead-capture.md`
- Update if required: `docs/integrations/knox-ldv-lead-capture.md`

- [ ] **Step 1: Reread and battle-test all changes**

  Check import aliases, test status authority, tenant isolation, secret redaction, exact raw-body verification, replay/idempotency, SSRF avoidance for any poller, default test filtering, side-effect suppression, form reactivity, Nuxt UI usage, dark mode, and duplicate UI/code paths.

- [ ] **Step 2: Run the focused acceptance suite**

  ```bash
  pnpm vitest run \
    test/public/track-tag.test.ts \
    test/server/utils/leads \
    test/server/api/leads \
    test/server/api/publicLeadCaptureTest.test.ts \
    test/server/utils/measurement/contracts.test.ts \
    test/server/utils/measurement/outbox.test.ts \
    test/server/utils/measurement/destinationRepository.test.ts \
    test/server/utils/measurement/providerTestService.test.ts \
    test/server/utils/googleConversionActions.test.ts \
    test/server/api/googleMeasurementConversionActionCreate.test.ts \
    test/workers/measurementDeliveryRepository.test.ts \
    test/app/clientMeasurementDestinationEditor.test.ts \
    test/app/leadConnectorPanel.test.ts \
    test/app/leadCaptureTestSlideover.test.ts \
    test/app/universalLeadGatewayMarketing.test.ts
  ```

  Expected: all focused tests pass.

- [ ] **Step 3: Run repository checks and compare the baseline**

  ```bash
  pnpm run typecheck
  pnpm test:run
  pnpm run build
  git diff --check
  git status --short
  ```

  Expected: no new type errors or full-suite failures relative to the Task 0 baseline; production build passes. Investigate every new failure before continuing.

- [ ] **Step 4: Verify migration state and production safety**

  Query the database for connector/test tables, typed conversion constraints/indexes, and separate Knox GWM Haval/Knox LDV records. Confirm every migration was applied once. Confirm no secrets or raw test PII appear in commits/logs.

- [ ] **Step 5: Run the deployment guard and deploy**

  ```bash
  pnpm deploy:check
  pnpm deploy:production
  ```

  Expected: immutable project target is `agency-dashboard`; deployment succeeds through the guarded script.

- [ ] **Step 6: Verify both Knox clients in production**

  Run a fresh signed synthetic website test for each client and verify all required stages. For Knox GWM Haval, verify Meta health/subscription or an explicit gated state. For Knox LDV, verify the GTM tag, five exact typed mappings, five validate-only Google results, and no cross-client or cross-type fan-out. Confirm the default inbox and analytics exclude test leads. Check the hourly health endpoint reports the correct status without notification flooding.

- [ ] **Step 7: Commit final verification evidence**

  Update both redacted Knox runbooks with deployed revision, timestamps, connector/destination statuses, counts, rollback points, and known external gates.

  ```bash
  git add docs/integrations/knox-gwm-haval-lead-capture.md docs/integrations/knox-ldv-lead-capture.md
  git commit -m "docs: record Knox activation verification"
  ```

---

## Separate Operational Follow-Up: Bendigo Kia Google Ads

Bendigo Kia's Google Ads OAuth/spend connection is deliberately outside this lead-gateway build. After Knox lead capture is stable, run a separate read-only account mapping audit and connect the correct Google Ads customer/manager account to the Bendigo XeroFlow client through the existing Google Ads connection flow. Verify campaign ownership, date range, currency/timezone, sync job status, and spend totals before enabling scheduled sync. Do not reuse a lead webhook credential for Google Ads OAuth.

## Completion Criteria

- Knox GWM Haval and Knox LDV each have their own trusted canonical receipt path, not merely browser heuristics.
- A signed website test for each client produces one reconciled canonical test lead with no production side effects.
- One authorised production enquiry per activated path lands exactly once with expected attribution, routing, and measurement evidence.
- Knox GWM Haval Meta instant forms are subscribed and backfilled without duplicates, or the UI truthfully exposes the outstanding Meta permission gate and interim import path.
- Knox LDV loads one XeroFlow tracker through `GTM-NNPZDBQB` with no duplicate page/route tracking and no form PII in browser events.
- Google Ads customer `389-217-6492` is connected to Knox LDV with the required OAuth scopes and tenant isolation.
- Stock, Finance, Test Drive, Contact Us, and Model Variant each route to exactly one matching Google conversion action; missing/unknown types and all non-matching actions create zero deliveries.
- Every lead source is represented by the connector registry and common health model.
- A new provider can be added through an adapter/capability declaration without changing canonical intake or downstream consumers.
- Focused tests, build, migration verification, deployment guard, and production smoke tests pass with no regression beyond the reconciled baseline.
