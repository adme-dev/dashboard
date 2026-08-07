# Roadmap: Google Merchant and Campaign Orchestration

**Overall status:** Planning in progress
**Current phase:** Phase 0 — control-plane verification and dependency reconciliation

## Dependency graph

```text
Concurrent PMax session merge ---------+
                                       |
Google project + Merchant topology ----+--> Phase 1 Merchant read foundation
                                       |              |
Live direct/subaccount credentials ----+              v
                                              Phase 2 readiness
                                                      |
                                 +--------------------+------------------+
                                 |                                       |
                                 v                                       v
               Phase 3 AI jobs + Gateway policy              PMax contract adoption
                                 |                                       |
                                 +--------------------+------------------+
                                                      v
                                          Phase 4 paused launch
                                              |               \
                                              v                v
                                Phase 6 production       Phase 5 controlled
                                rollout and closeout     writes (conditional)
                                              |                |
                                              +--------+-------+
                                                       |
                                             complete or transfer
```

## Delivery summary

| Phase | Outcome | Status | Hard dependency | Exit gate |
|---|---|---|---|---|
| 0 | Verified ownership, API registry, Merchant topology and merged PMax contracts | In progress | Other PMax session, Google administrators | No unresolved account/project ambiguity |
| 1 | Read-only Merchant API client and persisted observations | Pending | Phase 0 | Direct and subaccount reads match Merchant UI |
| 2 | Unified commerce-readiness API and UI | Pending | Phase 1 | Pilot accounts have evidence-backed status |
| 3 | AI-assisted campaign job/template workflow through governed Cloudflare AI Gateway routes | Pending | Phase 2 | Proposal creates confirmed internal jobs only; model quality/cost gate passes |
| 4 | Idempotent paused PMax creation and verified activation | Pending | Phases 0, 2 and 3 | Pilot campaign read-back matches approved plan |
| 5 | Narrow, approved Merchant writes | Conditional | Stable Phases 1-4, production read evidence and write-risk approval | Each operation previews and reconciles, or phase is explicitly transferred |
| 6 | Allowlisted production rollout, monitoring and closure | Pending | Required Phases 0-4; Phase 5 may be completed or transferred | Production evidence and handoff complete |

## Phase 0 — control-plane verification and reconciliation

### Outcome

The team knows exactly which Cloud project, OAuth clients, developer token, Merchant
account hierarchy and PMax contracts are authoritative. No provider registration or
shared launch code changes happen before this is true.

### Deliverables

- Sanitized Google project/API registry
- Merchant advanced-account/subaccount topology decision
- Ads developer-token access record
- Direct and subaccount pilot-account selection
- Rebase after concurrent PMax session completes
- Contract-diff report and adopted interface list
- Independent feature-flag/kill-switch map

### Exit gate

- `gen-lang-client-0818792107` is confirmed or rejected as the production project.
- Merchant registration target and developer owner are approved.
- Merchant API and Google Ads API are enabled in the chosen project.
- The PMax dependency is merged and this workstream is rebased cleanly.
- No duplicate migration, state machine or launch repository is planned.

## Phase 1 — read-only Merchant foundation

### Outcome

XeroFlow can retrieve, normalize and persist Merchant account, service-link,
data-source and product-health evidence through Merchant API without provider writes.

### Vertical slices

1. Authenticated account/service discovery.
2. Data-source processing health.
3. Product-status and issue aggregates.
4. Tenant-scoped persisted scans and material events.
5. Manual/scheduled scan lifecycle.
6. Legacy Content API audit parity and retirement plan.

### Exit gate

- One direct/controlling account and one subaccount path are compared with Merchant UI.
- Pagination, retry, partial failure, unknown enum and tenant-isolation tests pass.
- No Merchant mutation method is reachable.
- Legacy audit outputs reconcile or differences are documented and accepted.

## Phase 2 — unified commerce readiness

### Outcome

Media staff can see actionable Merchant/PMax readiness and the PMax preflight consumes
the same versioned result.

### Vertical slices

1. Pure readiness classifier and fixtures.
2. Tenant-scoped list/detail/summary/export APIs.
3. Portfolio summary, table and evidence slideover.
4. PMax brief/preflight integration.
5. Material-change notifications and runbook.
6. Public feature-page synchronization.

### Exit gate

- Every pilot campaign is ready, blocked, warning, stale or unknown with evidence.
- UI and launch preflight reconcile exactly.
- Empty, partial, stale and access-failure states are battle tested.
- Notifications remain disabled until media-owner sign-off.

## Phase 3 — AI-assisted job and template workflow

### Outcome

The XeroFlow assistant converts a governed template into a reviewable campaign job and
confirmed task set, with provider facts and inferred recommendations clearly separated.

### Vertical slices

1. Versioned template/normalized proposal contract.
2. Deterministic missing-input and conflict detection.
3. Retrieval-backed recommendation context.
4. Authenticated Cloudflare AI Gateway dynamic routes and cost/privacy controls.
5. Reproducible Workers AI/GPT-OSS 20B/120B quality-cost bake-off.
6. Propose-confirm-execute task creation.
7. Proposal review UI and audit history.
8. Feedback and outcome hooks without self-modifying policies.

### Exit gate

- The assistant never invents blocking campaign values.
- Provider mutation tools are absent from the AI registry.
- Created tasks match the confirmed proposal and are fully auditable.
- Every inference is attributable to an authenticated, versioned Gateway route and no
  direct-provider bypass exists.
- GPT-OSS 20B is standard unless the bake-off proves a bounded 120B escalation case;
  cost and quality thresholds are owner-approved.
- Media buyer and account manager complete one end-to-end pilot job.

## Phase 4 — paused Google Ads launch

### Outcome

An approved, readiness-passing plan can create one PMax Inventory campaign paused,
verify it and later activate it with a separate approval.

### Vertical slices

1. Merchant-link and selected-product validation in launch plan.
2. Approved-plan execution claim and provider validation.
3. Ordered/idempotent resource creation.
4. Provider read-back and field-level reconciliation.
5. Separate activation approval/action.
6. Spend, pacing, conversion and feed-health linkage.

### Exit gate

- Duplicate launch attempts create no duplicate resources.
- The campaign is paused after creation.
- Provider read-back matches every material approved value.
- Activation cannot happen without an independent approval.
- Kill switches and recovery states are exercised in preview.

## Phase 5 — controlled Merchant writes

### Outcome

Only explicitly approved operation types can change Merchant resources, with preview,
idempotency and read-back evidence.

### Candidate vertical slices

1. Data-source configuration operation.
2. Narrow inventory availability/price operation where business ownership is proven.
3. Issue-remediation proposal workflow.
4. Reconciliation and drift monitoring.

### Exit gate

- A separate write-risk review approves each operation type.
- The target, before/after values and payload hash are shown before approval.
- Provider state is read back and mismatches are recoverable.
- Bulk AI-directed catalogue mutation remains impossible.

## Phase 6 — production rollout and closure

### Outcome

The system is deployed through guarded Cloudflare workflows, monitored under an
allowlist, documented publicly and operationally, and supported by reproducible
completion evidence.

### Rollout stages

1. Preview with test/direct account.
2. Preview with manager/subaccount.
3. Production read-only allowlist.
4. Production AI job assistance.
5. One approved paused-campaign pilot.
6. Separate activation and complete reporting-cycle observation.
7. Optional Merchant-write pilot.
8. Broaden allowlist or retain restricted operation by policy.

### Exit gate

- `pnpm deploy:check` and the production build/deploy pipeline pass.
- Required migrations are applied and verified.
- Monitoring and rollback controls are tested.
- Public feature pages match delivered functionality.
- All requirements are complete or explicitly transferred with owner and due phase.
- The workstream is archived only after the production owner accepts the handoff.

## Checkpoint policy

At the end of every phase:

- Re-read every changed/new file end-to-end.
- Run focused tests and relevant type/lint filters.
- Run the build for feature/multi-file implementation changes.
- Perform the `AGENTS.md` deep-dive review checklist.
- Request code review and resolve findings.
- Record commands, outcomes, commit/PR and provider evidence.
- Update `STATE.md`, `REQUIREMENTS.md` and `TASKS.md` before merging.
