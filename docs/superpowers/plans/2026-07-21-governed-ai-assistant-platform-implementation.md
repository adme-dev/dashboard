# Implementation Plan: Governed AI Assistant Platform

**Date:** 2026-07-21
**Status:** Active — C0.1–C0.5 implementation, focused verification, and clean Pages packaging complete locally; independent security approval and an isolated release boundary remain open
**Goal:** Deliver a safe, useful personal AI assistant for every XeroFlow employee, composed from governed department capabilities, with Cloudflare Agents used selectively for durable specialists and Cloudflare Workflows used for deterministic long-running processes.
**Research basis:** `docs/research/2026-07-21-ai-assistant-departments-individuals.md`

## Outcome

Every signed-in employee receives one personal assistant experience. Its effective capabilities are the intersection of company policy, role/RBAC, department membership, tenant/client scope, feature release state, and personal preferences. Department owners curate reusable skill packs; they do not operate shared bot identities. All consequential effects continue through XeroFlow's deterministic propose -> confirm -> execute -> audit spine.

Cloudflare Think provides durable specialist identities, resumable investigations, programmatic turns, and schedules where those properties are valuable. It does not replace the mature Nuxt assistant engine or become the source of truth for identity, permission, scope, business rules, approvals, or writes.

## Scope

### Included

- Cloudflare Think route containment, data-scope hardening, step/tool limits, and observability.
- A versioned capability catalog for department packs, tools, models, approval rules, owners, and release status.
- Personal assistant composition from role, departments, assignments, preferences, and governed memory.
- Department packs for leadership, account management, paid media, marketing, creative, production/project management, sales, finance, bookkeeping, HR, operations, engineering, and constrained general roles.
- Model and prompt evaluations, adversarial scope tests, release gates, cost controls, privacy controls, and operational telemetry.
- Selective durable submissions/schedules, then one approval-heavy Cloudflare Workflow.
- Controlled pilot, progressive rollout, rollback, training, and success measurement.

### Excluded

- A separately coded or fine-tuned bot for every department or employee.
- A shared department chat identity.
- An unrestricted multi-agent swarm.
- Autonomous payments, employment decisions, privilege grants, destructive bulk operations, or silent live budget changes.
- A wholesale migration of the existing personal assistant to Think without benchmark evidence.
- Production deployment or feature activation without an explicit launch decision after the relevant release gate.

## Architecture decisions

1. **One engine, composed identity.** Keep `server/utils/aiChatEngine.ts`, the current tool loop, memory, controller, and My Assistant UI as the interactive core.
2. **Configuration narrows authority.** Department and personal settings may hide or constrain capabilities but never grant beyond RBAC, tenant/client access, or company policy.
3. **XeroFlow remains authoritative.** Authentication, scope, calculations, records, proposals, approvals, execution, and audit remain in Nuxt/Nitro and Neon.
4. **Think is a specialist harness.** Durable specialists may reason and propose through narrow app-owned tools; they do not receive database/vendor write credentials.
5. **Workflows own processes.** Long waits, retries, compensation, and consequential multi-step effects belong to deterministic Workflows; Think may supply a bounded reasoning step.
6. **Least agency by default.** Begin at read/draft. Introduce proposals per capability after evaluation. Policy execution is limited to reversible, idempotent operations.
7. **Server-derived scope.** User, tenant, allowed clients, department, role, and agent instance identity are authenticated facts, not prompt or model arguments.
8. **Evaluation is a release dependency.** No department pack, model change, prompt change, memory feature, or write tool advances because unit tests alone pass.

## Dependency graph

```text
C0 transport and scope safety
    |
    +--> capability catalog and owners
    |        |
    |        +--> department pack definitions
    |        +--> admin governance controls
    |        +--> personal capability composition
    |
    +--> evaluation harness and telemetry
             |
             +--> read/draft pilot
             +--> governed action pilot
             +--> durable schedules/submissions
                         |
                         +--> first Cloudflare Workflow
                                     |
                                     +--> progressive company rollout
```

## Delivery principles

- Work in thin, reversible vertical slices; keep dormant/incomplete capability behind existing or new safe-default flags.
- Write the failing abuse/regression test before each behavioural fix.
- Do not mix unrelated refactors or existing worktree changes into these increments.
- Additive schema migrations only; never edit historical migrations.
- Every capability declares an owner, risk tier, data class, permission, scope, approval, rollback, model policy, budget, and evaluation suite.
- Every checkpoint produces evidence: tests, typecheck/build, evaluation report, security review, and an operator-visible rollback.

## Phase C0: Cloudflare Think production-safety foundation

### Task C0.1: Default-deny the unused generic Agent transport

**Description:** Prevent public HTTP and WebSocket access to `/agents/{class}/{instance}` while current product surfaces use authenticated Nuxt endpoints. Preserve `/health` and shared-key `/tools/*` service bridges. Do not introduce raw secrets in WebSocket query strings.

**Acceptance criteria:**

- [x] An unauthenticated `/agents/*` request returns a generic denial and never reaches `routeAgentRequest`.
- [x] Supplying `INTERNAL_API_KEY` does not accidentally expose the browser chat transport; future enablement requires a separate signed, short-lived, scoped-token design.
- [x] Existing `/health` and authorised `/tools/*` behaviour remains unchanged.

**Verification:**

- [x] RED then GREEN: `pnpm vitest run test/workers/platform-agents/worker.test.ts`
- [x] Typecheck: `pnpm --dir workers/platform-agents run typecheck`
- [x] Inspect the Worker diff for fail-open paths and secret exposure.

**Dependencies:** None
**Files likely touched:** `workers/platform-agents/src/index.ts`, `test/workers/platform-agents/worker.test.ts`, `workers/platform-agents/README.md`
**Estimated scope:** Small

### Task C0.2: Make service-secret verification timing-safe and consistent

**Description:** Replace direct secret comparisons in the platform-agents Worker with one fail-closed verification helper. Keep response details generic and avoid logging credentials.

**Acceptance criteria:**

- [x] Missing, malformed, incorrect, and correct Bearer credentials have explicit tests.
- [x] Comparisons operate on fixed-size digests without a length-dependent early comparison.
- [x] Every `/tools/*` route uses the same verifier and missing configuration fails closed.

**Verification:**

- [x] Targeted Worker tests pass.
- [x] Worker typecheck passes.
- [x] Secret scan of the scoped diff finds no credential material; test fixtures contain placeholders only.

**Dependencies:** C0.1
**Files likely touched:** `workers/platform-agents/src/index.ts`, `test/workers/platform-agents/worker.test.ts`
**Estimated scope:** Small

### Task C0.3: Define and enforce an immutable agent-scope contract

**Description:** Introduce a typed scope contract containing tenant, allowed client IDs, user/service actor, permissions, and correlation ID. Scope is issued by the authenticated app boundary or future signed token, then passed as immutable agent props/RPC input. Model-visible tools may select only within that allowed set.

**Acceptance criteria:**

- [x] Tenant/user/client authority cannot be supplied solely by model tool arguments.
- [x] Missing or conflicting scope fails closed before an app bridge call.
- [x] Tenant/client isolation fixtures cover all four specialists: Financial Watch tenant/client scope, plus Spend Controller, Publishing Planner, and Traffic Controller client scope.

**Verification:**

- [x] Immutable contract and authenticated app/service boundary tests pass.
- [x] Short-lived HMAC assertions propagate authenticated user authority to one derived department-agent instance and are independently verified at the Worker router, Durable Object, and app tool boundary.
- [x] Cross-client negative tests pass for every specialist and cross-tenant negatives pass for the tenant-aware Financial Watch path.
- [x] Worker typecheck passes and the new scope contract contains no `any`; the repository-wide Nuxt typecheck remains blocked by a pre-existing unrelated error baseline.

**Dependencies:** C0.1, C0.2
**Files likely touched:** Worker scope module, `workers/platform-agents/src/index.ts`, internal agent API handlers, focused tests
**Estimated scope:** Medium; split by specialist if more than five files

### Task C0.4: Close runtime query-scope gaps

**Description:** Ensure every specialist query applies the authenticated tenant and allowed-client predicates. In particular, make Spend Controller's advertised `clientId` filter real and ensure Financial Watch budget alerts cannot become cross-tenant when `clientId` is null.

**Acceptance criteria:**

- [x] Spend results are constrained to the effective allowed-client scope; this data plane is organization/client scoped and has no separate Xero tenant key.
- [x] Financial reports, recommendations, alerts, and watch state share the same tenant/client boundary.
- [x] Nullable client filters resolve to an explicit database-derived allow-list instead of unrestricted client access.

**Verification:**

- [x] RED/GREEN runtime tests assert returned Financial Watch and Spend Controller outcomes for Tenant A and absence of Tenant B data.
- [x] Query parameters remain parameterized.
- [x] Existing platform-agent endpoint tests pass.

**Dependencies:** C0.3
**Files likely touched:** `spendControllerAgentRuntime.ts`, `financialWatchAgentRuntime.ts`, their API handlers and tests
**Estimated scope:** Medium

### Task C0.5: Bound and observe Think turns

**Description:** Set conservative Think defaults and connect lifecycle events to the existing Model Ops/run ledger. Remove unnecessary general workspace capability, cap steps/time/tokens, suppress reasoning streams, and emit tenant-safe correlation metadata.

**Acceptance criteria:**

- [x] Specialists have an explicit 3–5 step ceiling and `sendReasoning = false`.
- [x] Unneeded workspace tools are denied or the agent uses a harness without them.
- [x] Turn completion, tool-count, and latency events share a correlation ID without prompts, secrets, scope assertions, or raw PII in logs.
- [x] Model, recovery, denial, proposal, and cost events are ingested into the existing Model Ops/run ledger under the same correlation ID.

**Verification:**

- [x] Configuration, scope-confusion, widening, response-whitelist, and lifecycle-hook tests pass.
- [x] Model Ops can reconcile one test turn end-to-end.
- [x] Recovery exhaustion and tool failure produce an operator-visible event.

**Dependencies:** C0.3
**Files likely touched:** platform Agent classes, Model Ops ingestion/ledger, worker tests
**Estimated scope:** Split into two Medium tasks if necessary

### Checkpoint C0: Production-safety gate

- [x] Direct generic transport is contained; `/agents/*` remains default-denied.
- [x] Zero cross-tenant/client failures in the specialist isolation suite.
- [x] Worker tests, affected server tests, scoped lint/typecheck, cache-free Cloudflare Pages build, and Wrangler dry-run packaging pass.
- [x] App and Worker feature flags default off, rollback is flag-based, and no production flag is enabled automatically.
- [ ] Security review approves progression to capability work.

## Phase 1: Capability catalog and governance control plane

### Task 1.1: Add the versioned capability-catalog schema

**Description:** Add additive records for department packs, capabilities, tool bindings, owners, risk/data classes, permissions, approvals, model budgets, evaluation suites, release status, and versions. Reuse existing `departments`, roles, permissions, model policy, tool registry, and audit concepts rather than duplicating identity or execution state.

**Acceptance criteria:**

- [ ] Every capability can be traced to one department owner and one immutable version.
- [ ] Release states are `draft`, `pilot`, `active`, `suspended`, or `retired` with safe defaults.
- [ ] Catalog settings can narrow but cannot grant a permission or client scope.

**Verification:** Migration integrity tests, repository schema checks, and rollback notes.
**Dependencies:** Checkpoint C0
**Files likely touched:** one migration, schema documentation, catalog types/repository and tests
**Estimated scope:** Medium

### Task 1.2: Build the catalog read/composition service

**Description:** Compose effective capabilities from company release policy, department membership, role permissions, assignments, personal disables, and temporary suspension.

**Acceptance criteria:**

- [ ] The result is deterministic, explainable, cached safely, and cannot exceed RBAC.
- [ ] Multi-department users receive a union only after intersecting every capability with authority and scope.
- [ ] The service returns machine-readable denial reasons for UI and audit.

**Verification:** Table-driven role/department/assignment tests and zero-grant regression cases.
**Dependencies:** 1.1
**Files likely touched:** catalog service/types/tests and one existing agent-config integration
**Estimated scope:** Medium

### Task 1.3: Add owner/admin governance APIs and audit

**Description:** Provide permission-gated draft, version, pilot, activate, suspend, and retire operations. Every change records actor, before/after version, reason, and evaluation evidence.

**Acceptance criteria:**

- [ ] Department owners may edit only owned draft content; activation/suspension follows company governance permission.
- [ ] Activation is rejected when required eval gates are missing or stale.
- [ ] All changes are auditable and no destructive hard delete is available.

**Verification:** Auth/permission-negative API tests, concurrency/version-conflict test, audit assertions.
**Dependencies:** 1.1, evaluation result contract from 2.1
**Files likely touched:** focused APIs, service, audit adapter, tests
**Estimated scope:** Split into Medium slices

### Task 1.4: Add Command Center capability governance UI

**Description:** Show pack ownership, versions, tools, permissions, risk, evaluations, cost budget, release state, and kill switches in the existing governance surface.

**Acceptance criteria:**

- [ ] An authorised operator can understand why a capability is active and suspend it.
- [ ] The UI never implies that configuration overrides RBAC.
- [ ] Keyboard, screen-reader, loading, empty, error, and confirmation states are covered.

**Verification:** Component tests plus authenticated browser verification.
**Dependencies:** 1.2, 1.3
**Files likely touched:** one page/panel, composable/types, component tests
**Estimated scope:** Medium

### Checkpoint 1: Governable capabilities

- [ ] A draft capability can be versioned, evaluated, activated, explained, suspended, and audited.
- [ ] Permission-negative and stale-evaluation paths fail closed.
- [ ] Tests, typecheck, build, and accessibility verification pass.

## Phase 2: Evaluation and release-gate system

### Task 2.1: Define the evaluation case/result contract

**Description:** Store or load versioned golden tasks with input, scope fixture, expected tools/no-tool, required sources, prohibited effects, scoring rubric, owner, and result metadata.

**Acceptance criteria:** Cases are immutable by version; results identify model/prompt/pack/tool versions and cannot be reused after a material change.
**Verification:** Schema/contract tests and fixture validation.
**Dependencies:** C0
**Estimated scope:** Medium

### Task 2.2: Build the deterministic evaluation runner

**Description:** Execute selected pack/model versions against isolated fixtures, capture trace and cost, score deterministic assertions, and queue human review only for subjective dimensions.

**Acceptance criteria:** Runner is repeatable, budgeted, abortable, tenant-isolated, and produces no real side effects.
**Verification:** Seeded pass/fail suites, timeout/cost ceiling tests, no-write proof.
**Dependencies:** 2.1
**Estimated scope:** Split into runner and persistence tasks

### Task 2.3: Seed pilot department suites

**Description:** Create 25–50 representative tasks plus adversarial, stale, ambiguous, scope-negative, memory, refusal, and proposal-resolution cases for account/production, paid media, and finance/bookkeeping.

**Acceptance criteria:** Department champions approve cases and zero-tolerance gates exist for scope, prohibited action, and approval bypass.
**Verification:** Fixture lint and baseline result report.
**Dependencies:** 2.1, pack drafts from Phase 3
**Estimated scope:** One Medium task per department

### Task 2.4: Add evaluation and cost views to Model Ops

**Description:** Display release scores, regressions, traces, latency, token/provider cost, scope denials, and unresolved human reviews by version.

**Acceptance criteria:** Operators can identify the exact change that caused a regression and block/suspend release.
**Verification:** API/component tests and seeded browser verification.
**Dependencies:** 2.2
**Estimated scope:** Medium

### Checkpoint 2: Measured release gate

- [ ] Correct tool/no-tool and groundedness meet the approved thresholds.
- [ ] Scope, prohibited action, and approval-bypass failures are zero.
- [ ] Results are version-bound and visible in Model Ops.

## Phase 3: Personal composition and first department packs

### Task 3.1: Make department membership first-class in assistant context

**Description:** Resolve governed department memberships, role, assignments, manager/escalation route, preferences, and active pack versions at turn admission.

**Acceptance criteria:** Context is server-derived, minimal, explainable, and does not include unrelated employee or HR data.
**Verification:** Multi-department, role-change, offboarding, and client-assignment tests.
**Dependencies:** 1.2
**Estimated scope:** Medium

### Task 3.2: Ship the account/production read-draft pack

**Description:** Cover daily brief, client/project risk, capacity, brief-to-plan, meeting recap, task drafts, and approval chase without writes initially.

**Acceptance criteria:** Golden suite passes; sources and freshness are visible; proposed task payloads remain disabled until the action gate.
**Verification:** Pack tests, evaluation suite, pilot telemetry.
**Dependencies:** 2.2, 3.1
**Estimated scope:** Medium

### Task 3.3: Ship the paid-media read-draft pack

**Description:** Cover pacing, stale syncs, anomaly explanation, diagnostics, experiment context, and explainable budget recommendations.

**Acceptance criteria:** No live mutation; stale data blocks proposals; client/platform/period scope is exact.
**Verification:** Pack/eval tests including rich-confirm payload fixtures.
**Dependencies:** C0.4, 2.2, 3.1
**Estimated scope:** Medium

### Task 3.4: Ship the finance/bookkeeping read-draft pack

**Description:** Cover snapshots, profitability, over-servicing, exceptions, classifications, EOM preparation, and variance narratives without ledger/payment effects.

**Acceptance criteria:** Tenant and finance permissions are enforced; evidence and period are explicit; disconnected/stale Xero degrades safely.
**Verification:** Pack/eval tests and finance-owner sign-off.
**Dependencies:** C0.4, 2.2, 3.1
**Estimated scope:** Medium

### Task 3.5: Explain “what my assistant can do and why”

**Description:** Extend My Assistant with active departments/packs, tool permissions, disabled tools, current scopes, pack versions, memory controls, and plain-language denial reasons.

**Acceptance criteria:** Employees can inspect and narrow capabilities and edit/delete permitted memories; they cannot grant themselves access.
**Verification:** Component/API tests and accessible browser verification.
**Dependencies:** 1.2, 3.1
**Estimated scope:** Medium

### Checkpoint 3: Read/draft pilot

- [ ] Five to ten approved users can complete representative work in the first three cohorts.
- [ ] Explicit-only personal memory; observe-and-learn remains off.
- [ ] Useful-task, groundedness, latency, cost, and trust baselines recorded.
- [ ] No new write capability or production-wide activation.

## Phase 4: Governed actions and durable processes

### Task 4.1: Bind catalog risk policy to the existing action gateway

**Description:** Generate approval type, approver, expiry, value limits, rollback/reconciliation, and audit requirements from the governed capability while retaining executor-side revalidation.

**Acceptance criteria:** A2/A4 actions cannot execute without the correct current approval and scope; stale proposals expire.
**Verification:** Tamper, replay, double-confirm, permission-revocation, and rollback tests.
**Dependencies:** Checkpoint 3, 1.2
**Estimated scope:** Split by action family

### Task 4.2: Pilot low-risk account/production and CRM proposals

**Description:** Enable create/assign/status/log proposals for selected pilots with exact previews and idempotency.

**Acceptance criteria:** Resolved payload accuracy meets the release gate and all outcomes are audited.
**Verification:** Endpoint/executor/evaluation tests and sampled human review.
**Dependencies:** 4.1
**Estimated scope:** Medium

### Task 4.3: Pilot rich-confirm paid-media proposals

**Description:** Enable bounded planned budget actions with evidence, stale-data block, value clamps, approval, provider reconciliation, and rollback reference.

**Acceptance criteria:** No Think or model path performs a live mutation; execution remains an approved app action.
**Verification:** Budget action contract, provider mock, reconciliation, and rollback tests.
**Dependencies:** 4.1, paid-media eval gate
**Estimated scope:** Medium

### Task 4.4: Implement one Cloudflare Workflow

**Description:** Select one process with durable waits/retries—recommended: publishing approval or EOM preparation. Workflow owns steps, idempotency, approval wait, retry, compensation, and final audit; Think is restricted to a defined reasoning step.

**Acceptance criteria:** Restart/retry cannot duplicate side effects; rejection and timeout terminate safely; app remains authoritative.
**Verification:** Workflow replay, duplicate event, timeout, rejection, compensation, and integration tests.
**Dependencies:** 4.1 and selected department gate
**Estimated scope:** Split into contract, workflow, UI/status slices

### Checkpoint 4: Governed execution

- [ ] Consequential action without required approval: zero.
- [ ] Correct resolved payload: at least the approved release threshold.
- [ ] Every attempted and completed action is reconciled and auditable.

## Phase 5: Remaining department coverage

Each pack is a separate vertical slice with its own owner, risk assessment, golden/adversarial suite, read/draft pilot, and optional action progression.

1. **Creative and design:** brand retrieval, brief interpretation, concept/asset drafts, proof feedback, asset lineage.
2. **Marketing/social/email:** campaign calendar, performance, listening/inbox, brand/compliance checks, drafts and approval routing.
3. **Sales/CRM:** evidence-based qualification, stale deals, meeting prep, follow-up/quote drafts, account handoff.
4. **Leadership/operations:** portfolio briefing, capacity/profitability/pipeline synthesis, decision log, allocation recommendations.
5. **HR:** physically constrained policy/onboarding/evidence tools; no autonomous employment decisions or hidden scoring.
6. **Engineering/IT:** runbook/repository/status search, incident timeline, issue drafts; production changes stay in normal CI/CD controls.
7. **Members/viewers/guests:** navigation, assigned-work and process help with read/draft-only ceilings.

### Checkpoint 5: Company role coverage

- [ ] Every governed role maps to a tested default pack or explicitly constrained general pack.
- [ ] Department owners approve knowledge, terminology, workflows, and evaluations.
- [ ] HR privacy and engineering production boundaries pass separate reviews.

## Phase 6: Selective proactivity and durable specialists

### Task 6.1: Add idempotent programmatic Think submissions

Use authenticated server-side RPC or a private service binding to submit event-driven investigations. No public generic transport is reopened.

### Task 6.2: Add one scheduled exception digest

Start with paid-media pacing or finance exceptions. Store schedule ownership/timezone, deduplicate notifications, honour quiet periods, and provide pause/delete controls.

### Task 6.3: Introduce bounded specialist delegation only where measured

Compare existing L2 orchestration with Think agents-as-tools. Adopt only if task success improves enough to justify latency, cost, and scope surface.

### Task 6.4: Evaluate observed memory and proactive suggestions

Complete the Privacy Impact Assessment, employee notice/control review, precision tests, retention/offboarding behaviour, and hidden-performance-scoring prohibition before any activation.

### Checkpoint 6: Durable value without excessive agency

- [ ] Schedules and submissions are authenticated, idempotent, pausable, and observable.
- [ ] Proactivity meets usefulness thresholds without notification overload.
- [ ] Memory precision, correction, deletion, retention, and privacy gates pass.

## Phase 7: Rollout and operations

### Task 7.1: Staged release and training

Roll out cohort by cohort with acceptable-use guidance, examples, responsibility boundaries, memory controls, and incident reporting.

### Task 7.2: Operational SLOs, alerts, and incident response

Monitor task success, scope denial, approval bypass, grounding, tool failure, latency, recovery, provider degradation, and cost. Alert on symptoms with a documented kill-switch and rollback runbook.

### Task 7.3: Eight-week outcome review

Compare cycle time, repetitive work, overdue work, pacing response, CRM completeness, active usage, trust, edits/rejections, rollback, and cost per successful task against pilot baselines. Retire capabilities that do not create measurable value.

## Global verification matrix

| Layer | Required evidence |
|---|---|
| Pure contracts | Unit tests, strict schema validation, no `any` at authority boundaries |
| API/auth | Unauthenticated, unauthorised, cross-tenant, cross-client, malformed, stale, and revoked cases |
| Tools/actions | Correct selection, exact resolved entity/payload, idempotency, expiry, approval, audit, rollback/reconciliation |
| Model behaviour | Golden, adversarial, ambiguity, stale/missing/poisoned source, refusal, grounding, memory cases |
| Cloudflare Worker | Runtime tests, route auth, binding/config consistency, bounded execution, structured tenant-safe telemetry |
| UI | Component tests, keyboard/screen-reader states, permission explanation, confirmation comprehension |
| Workflow | Retry/replay, wait/timeout/reject, compensation, duplicate-event, operator recovery |
| Release | Typecheck, affected suites, full build, security/privacy review, feature-flag and rollback proof |

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-scope disclosure through an agent or tool | Critical | Default-deny transport; server-derived immutable scope; double enforcement; isolation tests |
| Assistant acts beyond user authority | Critical | RBAC ceiling, narrow catalog, executor recheck, approval, hard-coded prohibited actions |
| Framework maturity or breaking change | High | Pin production versions, contract tests, canary upgrade, app-owned authority, rollback flags |
| Prompt/tool/memory poisoning | High | Treat retrieved/model content as untrusted; provenance; no auto-promotion; adversarial evals |
| Employee surveillance or hidden scoring | High | PIA, notice, visibility/correction/deletion, purpose limits, explicit prohibition and audit |
| Multi-agent cost/latency/cascades | Medium | Single pack by default; fan-out/step/deadline/cost caps; partial-result fallback |
| Department content becomes stale | Medium | Named owner, freshness metadata, review schedule, pack/version suspension |
| Adoption without business value | Medium | Baselines, task-success metrics, champion review, retire low-value capabilities |

## Milestones and indicative sequence

| Milestone | Indicative duration | Exit condition |
|---|---:|---|
| C0 production-safety foundation | 2–3 weeks | Transport, scope, limits, telemetry, isolation gate |
| Capability catalog + eval foundation | 3–4 weeks | Governed version can be evaluated/activated/suspended |
| First three read/draft packs | 2–3 weeks | Controlled pilot passes quality/privacy/safety gates |
| Governed actions + first Workflow | 3–4 weeks | Audited action and replay-safe Workflow evidence |
| Remaining department packs | 4–8 weeks, incremental | Tested role coverage and department-owner approval |
| Proactivity and wider rollout | Ongoing | Measured value, privacy approval, operational readiness |

Durations are planning ranges, not commitments. Capability and evaluation foundations can overlap after C0, but authority contracts, migrations, and release gates remain sequential dependencies.

## Immediate implementation increment

Tasks **C0.1–C0.5** are implemented with focused verification locally:

1. The regression test first failed with the unauthenticated request returning the mocked routed response.
2. The generic transport now fails closed and is no longer advertised as public.
3. `/health` and authorised `/tools/*` behaviour remains covered.
4. One fixed-length-digest verifier covers missing, malformed, incorrect, missing-configuration, and correct service credentials.
5. An immutable authority/scope contract now carries actor, authenticated tenant, explicit allowed clients, source, and correlation ID.
6. Authenticated users receive client allow-lists from RBAC plus active client assignments; authenticated service calls receive only active organization clients and verified connected tenants.
7. All four specialist runtimes require that scope at the type boundary. Spend and Financial Watch queries now bind explicit client arrays; request context cannot widen the set.
8. Internal app bridges use one fixed-length-digest Bearer verifier and derive service scope before calling a runtime.
9. Xero tenant selection now requires Finance permission and validates the selected ID and canonical name against Xero's authenticated connections list.
10. `budget_alerts` now has an additive tenant-ownership migration. New alerts are stamped from authenticated app authority; legacy rows are backfilled only when exactly one non-default org tenant exists, while ambiguous/unclassified rows fail closed in Financial Watch.
11. Financial Watch and Spend Controller apply defense-in-depth result filtering after parameterized SQL. Mixed-source RED/GREEN fixtures prove Tenant B/client B data is absent from the returned assistant outcome.
12. Publishing Planner retains `client_id` through every aggregate and filters every result set before constructing findings or summaries. Traffic Controller binds an explicit allowed-client array, removes its prior null/unrestricted ledger read, and filters model-visible signals again in memory.
13. Mixed-source RED/GREEN fixtures prove client B publishing data and traffic signals cannot enter client A counts, findings, recommendations, or previews.
14. A dedicated compact HMAC assertion binds authenticated user authority, normalized tenant/client scope, permissions, correlation ID, one department agent, and one opaque derived instance for at most 120 seconds. The app issues it server-side; the Worker router, Durable Object, and app bridge independently verify it.
15. A dormant authenticated app proxy calls only `/v1/turns/{agent}/{bound-instance}`. Both app and Worker gates default off, generic `/agents/*` remains default-denied, tokens never reach the browser, and trusted `/tools/*` service traffic remains separately authenticated.
16. Every Think specialist uses an exact tool allow-list, `maxSteps = 4`, `maxOutputTokens = 2048`, one retry, a 60-second stream-stall timeout, `sendReasoning = false`, and no workspace/Bash tools. Scope-clamping tests prove model tool arguments cannot widen the signed tenant/client set.
17. Programmatic turns emit one tenant-safe structured lifecycle event with correlation ID, agent, request ID, status, step/tool counts, and duration. Prompts, assertions, user/client/tenant identifiers, and upstream error bodies are excluded.
18. `@cloudflare/think` is upgraded to `^0.13.0` and `agents` to `^0.17.4`. The integration uses documented `chat(..., { metadata })` admission because the installed Think 0.13 wait-mode implementation drops `runTurn({ body })` before admission; this compatibility constraint is recorded in the Worker runbook.
19. Think turn admission now starts an existing `ai_agent_runs` record without storing the prompt. Completion and failure paths write bounded model, token, cached-token, latency, tool-count, tool-failure, finish-reason, and recovery fields, then link one aggregate `ai_invocations` row by run ID, request ID, and correlation ID.
20. The invocation cost model and registry now include current Workers AI pricing for `@cf/moonshotai/kimi-k2.7-code`: $0.95/M uncached input tokens, $0.19/M cached input tokens, and $4.00/M output tokens. Cached input is clamped to prompt tokens before estimation. Source: [Cloudflare Workers AI model documentation](https://developers.cloudflare.com/workers-ai/models/kimi-k2.7-code/).
21. Worker telemetry is parsed through a strict allow-list and numeric bounds at the app boundary. Prompts, assistant text, assertions, upstream error bodies, and raw provider diagnostics are not written to the run or invocation metadata and are not returned to the browser on failures.
22. Think durable chat recovery is explicitly bounded to two attempts, one OOM retry, a 60-second no-progress window, and 64 recovery work units. The SDK's real `onExhausted` hook marks the turn as a redacted recovery failure; tool hook failures are counted without retaining their error bodies.
23. Recovery exhaustion also uses a one-way Worker-to-app telemetry bridge for the case where the original fetch has timed out or the Durable Object isolate has restarted. The app requires service authentication, independently verifies the short-lived assertion's agent, instance, permissions, and correlation, then records a prompt-free recovery run; the event excludes the SDK reason, terminal text, and partial response. Replays derive a hashed event key from the signed assertion ID and recovery-root request ID and are atomically deduplicated with a transaction-scoped Postgres advisory lock.
24. Model Ops now exposes Think turn/failure counts, tool failures, recovery exhaustion, model and finish reason, correlation IDs, linked run/invocation IDs, tokens, latency, and estimated cost. The view answers four operator questions without revealing conversational content: did the turn succeed or recover, which model/resources were used, can its records be reconciled, and did tools or recovery exhaust?
25. One hundred seventy-three focused Worker, endpoint, authority, service-auth, tenant-selection, migration-contract, proxy, assertion, lifecycle, ledger, Model Ops, recovery, replay, and abuse tests pass across 20 files. Scoped server lint, Worker typecheck, `git diff --check`, Wrangler 4.110.0 dry-run packaging, and a cache-free Cloudflare Pages build all pass. The build completes Nuxt client/server compilation, prerendering, Nitro packaging, and the final wrapped Worker output.

The next gate is an independent security review of C0. No capability catalog implementation or evaluation rollout should progress past that gate until the review approves the authority contract, tenant/client isolation, telemetry redaction, recovery bounds, and dormant feature flags. After approval, work advances to the Phase 1 capability catalog and Phase 2 evaluation foundations. The tenant-ownership migration is authored but not applied to production, and no production feature flag, secret, or Worker deployment has been changed.

### Verification note

The earlier `pnpm audit --prod --audit-level high` run reported a pre-existing high-severity advisory in `@opentelemetry/sdk-node@0.56.0`, reached through `@rocicorp/zero`. The Think/Agents SDK versions were upgraded and covered by focused tests, Worker typecheck, and Wrangler dry-run packaging; the unrelated Zero/OpenTelemetry advisory still requires its own compatibility-tested remediation.

The current repository-wide `pnpm run typecheck` fails with a large pre-existing baseline across unrelated Vue components and server utilities. No reported diagnostic from that run points to the new alert migration, Financial Watch filter, Spend Controller filter, or budget-alert creation route; scoped tests, scoped lint, Worker typecheck, and build evidence are used for this slice. Restoring the global Nuxt type gate remains a separate prerequisite before Checkpoint C0 can pass.

The clean-build blocker in the separate Send workstream was corrected by using Nuxt's root alias (`~~/shared/types/send`) for the runtime import. Its focused Send contract tests pass, and a fresh cache-free `npm run build` now completes through Cloudflare Pages packaging. The remaining release-boundary risk is the mixed dirty checkout: production promotion must use an isolated reviewed commit or worktree, never the current aggregate working directory.

## Decisions that require human approval later

- Production feature activation and pilot membership.
- Department capability owners and evaluation champions.
- Employee privacy notice, retention, observe-and-learn, and proactive suggestion policy.
- Which process becomes the first Workflow.
- Any new permission, high-risk action family, external integration, or autonomous A3 policy.
- Deployment, production secrets, Cloudflare Access policy, and release promotion.
