# Task 3 Report — Close Indirect CRM Record-Access Bypasses

## Result

- Base and pre-commit HEAD: `3fa97941caafddfc776b51c4c78bb43e1a448040`
- Intended commit: `fix(crm): close indirect owner-scope bypasses`
- Scope: Task 3 only; no production, network, database, migration, or deployment action was run.
- Final behavioral gates: 32 test files and 265 tests passed (11/101 focused; 21/164 Task 1/2, trusted-system, inventory, and cron regressions).
- Touched-path typecheck filter: zero diagnostics. The full repository typecheck still reports 865 diagnostics in unrelated files; those baseline failures were not changed.

## Implemented Security Boundaries

### Batch, dedupe, import, and export

- Bulk mutations authorize and lock the complete requested record set in one transaction before the update; one hidden or missing ID aborts the entire write with the canonical 404.
- Dedupe suggestions load only owner-visible rows before forming pairs or projecting either side.
- Dedupe merges authorize both winner and loser inside the merge transaction before any child reassignment, deletion, or merge-log write.
- CSV import duplicate checks use the actor's owner filter. Hidden duplicates do not become skip-count or database-error oracles; inserted records are owned/created by the fresh actor.
- CSV/XLSX export applies client, owner, search, and user filters before selecting export columns.

### Parent-inherited children

- Documents, communications, relationships, and opportunity line items authorize their current protected parent(s).
- Child mutations reload and lock the child/current parent in the mutation transaction.
- Document upload denies before R2 upload and reauthorizes when metadata is inserted; failed metadata insertion cleans up the uploaded object.
- Relationship reads authorize both endpoints before loading names; soft-deleted endpoint names are excluded.
- Line-item amount rollups run in the same transaction as the authorized child mutation.

### Aggregates, targets, health, scoring, and AI signals

- Pipeline, adoption, forecast, funnel, performance, summary, audit, health, and lead-scoring queries filter owner-visible records before counts, sums, buckets, names, or histories are produced.
- Sales-target lists restrict owner-scoped users to their target rows. Leaderboards filter both target rows and won opportunities before won-value and attainment calculations.
- Opportunity AI signal gathering authorizes the opportunity and every linked person/company before communication, score, or name queries.
- A supplied hidden or missing quote ID now returns the same `404 Record not found` response.

### Meetings, quotes, configuration, and stage automation

- Meeting candidate anchors, company alternatives, opportunities, and disambiguation options are authorized before proposals are returned.
- Manual and automatic meeting conversion receive a fresh actor/trusted client context, preauthorize the target, and reauthorize it inside the task-insert transaction.
- Quote generation authorizes the opportunity before reading line items and again inside the atomic quote/items/opportunity-link transaction.
- Assignment-rule pools are fully validated as active client-team members before the rule write. The locking query avoids PostgreSQL's invalid `DISTINCT ... FOR SHARE` combination while comparing unique authorized IDs.
- Assignment/stage-automation configuration routes resolve a fresh CRM context. Stage automation authorizes the opportunity and linked protected records before scoring/lifecycle work and reauthorizes before every task insertion.

### Trusted-system lead, email, cron, and workflow paths

- Added a narrow `TrustedCrmSystemContext` with an enumerated purpose. It is created only after authoritative active-client and organisation-scope reloads.
- Reminder cron/workflow paths discard stale/inactive client batches, authorize every task, then transactionally lock and claim the complete set before notification, audit, or summary counts.
- Lead promotion resolves the trusted client before CRM matching/writes, authorizes existing links and every identity match inside the promotion transaction, and never logs IDs/provider details on denial.
- Inbound email resolves the trusted client before locks/lookups and authorizes all protected conversation-route targets before lead/message work.
- Email-to-communication projection resolves the trusted client, locks message/conversation, authorizes linked person/company targets, and only then inserts the projection.
- Health, score-decay, lifecycle, meeting-action, and stage-activation internal paths resolve an explicit trusted scope, authorize before signals/side effects, and reauthorize transactionally before writes.

### CRM AI tools and custom records

- All four registered CRM proposal/draft tools require `CLIENTS`; the registry fails fast if a CRM tool is registered without it.
- CRM tools use the fresh CRM-specific AI client resolver, not a global `agency_clients` name lookup. Missing, ambiguous, stale, or unassigned clients return the same generic `No matching client.` result.
- Person/company/opportunity match SQL applies owner visibility before names are projected, then every match is reauthorized before selection or disambiguation output.
- Confirmation mutations continue through the transactionally reauthorizing CRM endpoints.
- Custom-record list/count queries filter every protected relation field before projection/aggregation. Get, audit, patch, move, and delete authorize current relations; create/patch authorize new relations inside their transactions.
- Malformed relation definitions without a `person` or `company` protected target fail closed for list filtering, validation, and mutation authorization.

## Behavioral TDD Evidence

The required four-file indirect-surface suite was first run before production changes and failed across batch/dedupe, children, aggregates, meetings/quotes, trusted paths, and custom relations. Sequential slice checkpoints were sent while the work proceeded.

Explicitly counted later RED evidence totalled 24 failing assertions:

- Meetings: 2 failures.
- Trusted context/reminder/lead-promotion/inbound-email/projection: 5 failures.
- CRM AI authorization/disambiguation: 2 failures.
- Custom relations, validation, and assignment pool: 4 failures.
- Late AI-linked-record, soft-deleted relationship-name, and PostgreSQL assignment-lock regressions: 3 failures with 19 passing.
- Health bind-order mutation test: 1 failure with 6 skipped; restoring the correct implementation returned the suite to green.
- Malformed custom relation fail-closed regression: 1 failure with 8 skipped.
- Uniform hidden/missing quote regression: 1 failure with 7 skipped.
- Existing cron harness against the new trusted boundary: 4 failures; the harness was updated to model authorization/claiming and made independent of fake-clock drift.

The initial required-suite failures are additional to the 24 explicitly counted later failures; they were not re-created after implementation because that would require reverting production fixes.

## Verification

### Required Task 3 focused gate

```text
pnpm exec vitest run \
  test/server/api/crmOwnerScopeBatchSurfaces.test.ts \
  test/server/api/crmOwnerScopeChildren.test.ts \
  test/server/api/crmOwnerScopeAggregates.test.ts \
  test/server/api/crmOwnerScopeIndirectPaths.test.ts \
  test/crm/bulk.test.ts test/crm/dedupe.test.ts \
  test/crm/meetingBridge.rankTargets.test.ts test/crm/oppQuote.test.ts \
  test/crm/targets.test.ts test/ai/crmActions.test.ts \
  test/server/utils/leads/crmPromotion.test.ts

PASS: 11 files, 101 tests
```

### Task 1/2, inventory, trusted-system, email, custom-record, and cron regression gate

```text
pnpm exec vitest run \
  test/server/utils/crm/recordAccess.test.ts \
  test/server/api/crmOwnerScopeCrud.test.ts test/crm/queryScope.test.ts \
  test/server/api/crmOpportunityMove.test.ts test/crm/tasks.test.ts \
  test/server/utils/crm/opportunityStageTransition.test.ts \
  test/config/crmRecordAuthorizationInventory.test.ts \
  test/ai/godModeInternalMiddlewareChain.test.ts \
  test/server/utils/crm/searchContext.test.ts \
  test/server/utils/crm/clientCrmAccess.test.ts \
  test/config/clientCrmRbacContract.test.ts test/server/utils/clientAuth.test.ts \
  test/server/utils/crm/emailCommunicationProjection.test.ts \
  test/server/utils/crm/emailInboundProcessor.test.ts \
  test/crm/engine/recordFilter.test.ts test/crm/engine/validateRecord.test.ts \
  test/crm/activation.test.ts test/crm/assignment.test.ts test/crm/stageAutomation.test.ts \
  test/server/api/crmTaskRemindersCron.test.ts test/workers/crm-cron.test.ts

PASS: 21 files, 164 tests
```

### Static checks

- `git diff --check`: clean.
- Full `pnpm run typecheck`: fails on 865 pre-existing diagnostics outside Task 3 paths.
- Filtering the full typecheck output against every modified/new Task 3 file: zero diagnostics.
- `test/config/crmRecordAuthorizationInventory.test.ts`: passed; the existing canonical inventory already classifies the touched routes, so no silent exclusion or baseline change was needed.

## Deep Review

- Re-read all 104 modified/new source and test files end-to-end, followed by a second pass over every late-hardening edit.
- Checked server imports for the required `~~/server` alias convention.
- Checked every mutation path for preauthorization and transaction-local reauthorization where state can change.
- Checked denial paths for uniform 404 behavior and absence of hidden names, counts, IDs, provider details, or pre-denial side effects.
- Checked owner filtering occurs before aggregation, export projection, names, won-value, and attainment math.
- Preserved string/client-only helper behavior used by existing portal/team call sites; fresh actor contexts are threaded only through agency paths.
- No migration, form/UI, marketing-page, external service, or deployment change was required for this backend security task.

## Additional Necessary Files Beyond the Brief's Explicit List

- `server/utils/crm/searchContext.ts` and `server/utils/crm/recordAccess.ts`: required to represent and consume explicit trusted-system authority.
- `server/api/cron/crm-health-recompute.post.ts`, `server/api/cron/crm-score-decay.post.ts`, and `server/api/cron/crm-meeting-actions.post.ts`: required to remove raw internal CRM authority from the remaining touched trusted paths.
- Existing email, lead-promotion, validation, and reminder-cron tests were updated because their runtime harnesses exercise these new security boundaries.

## Remaining Concerns

- Repository-wide typecheck remains red only in unrelated baseline files (865 diagnostics); Task 3 touched paths are clean.
- No unresolved Task 3 authorization concern remains from the final deep review.

## Commit

`faff9e70` — `fix(crm): close indirect owner-scope bypasses`

---

# Review Round 1 — Indirect Authorization Repair

## Result

- Review base: `faff9e709b705f168282db86c32f3effb5381551`.
- Scope: the eight Task 3 review findings only; no production, network, database, migration, or deployment action was run.
- Fresh final gates: 12 focused files/100 tests, 11 exact Task 3 files/107 tests, and 21 broad Task 1/2/security/trusted/custom files/175 tests passed.
- The full Node 24 typecheck still reports the existing 865 unrelated diagnostics. Filtering that output against every review-round source and test path produced zero diagnostics.

## Repairs

- Meeting conversion now locks and reloads the action item and its existing linked task in one transaction, client-qualifies and authorizes that task with the supplied actor context, verifies the live link, and returns only after those checks. Hidden and cross-client idempotent links use the canonical 404.
- Agency activity and opportunity follow-ons retain the fresh actor context for score, health, and lifecycle calls. The health helper authorizes before reading lifecycle state, so an ownership flip cannot fall through to trusted-system work.
- Complete CRM reference sets are locked in stable type-and-UUID order while authorized results remain in caller order. Reversed bulk, dedupe, and mixed-reference tests exercise the shared ordering.
- Stage-automation configuration validates a non-null task assignee as an active client-team member in the configuration transaction. Runtime automation repeats that validation before explicit or owner-fallback task insertion. Assignment checks lock both the member and assignment rows.
- Inbound email locks the server-owned route first and derives authoritative tenant, route kind, and conversation identity from it. Projection does the same from the server-owned message. Both paths then lock the client-qualified current conversation and authorize its live targets before retaining that lock through insertion.
- Health and score cron candidates are grouped by opaque client identifiers, resolved into fresh active trusted scopes, and authorized before they consume batch limits or contribute to summaries. The health helper applies the same authority-before-lifecycle-read rule.
- Agency communication creation or deletion with no current person or company parent now fails with `404 Record not found` before any write.
- Custom relation definitions are validated in every context; present values must be null/blank or UUID strings. Portal list/count and detail projection now apply relation-integrity filters without applying staff-owner predicates, and malformed stored relations fail closed.
- The newly introduced trusted-candidate helper is explicitly classified in the canonical CRM authorization inventory; it was not silently excluded.

## Behavioral TDD Evidence

The consolidated pre-production RED run covered 11 files and 98 tests: 31 failed and 67 passed.

- Meeting hidden/cross-client idempotency: 2 failures.
- Activity/opportunity actor-context propagation and health pre-read authority: 3 failures.
- Stable mixed-reference, bulk, and dedupe lock ordering: 3 failures.
- Configuration/runtime assignment validation and two-row locking: 5 failures. This also exposed the missing runtime transaction import.
- Inbound email and projection authoritative tenant, live-target, and locking behavior: 8 failures.
- Inactive-client cron starvation and summary accounting: 2 failures.
- Orphan communication creation/deletion: 2 failures.
- Custom relation definition and value validation across contexts: 6 failures.

During the required deep review, route-level portal projection tests then reproduced a remaining integration gap: 2 tests failed because portal list/detail handlers did not yet supply or apply relation definitions. Those tests passed after the bounded route repair. No production edit for either RED group preceded its behavioral failure.

## Verification

### Focused review repair gate

```text
PASS: 12 files, 100 tests
```

This gate covers meeting idempotency, agency follow-ons, health pre-read authority, lock ordering, assignment/stage automation, inbound email/projection, trusted crons, orphan communications, custom relation validation, and portal relation projection.

### Exact Task 3 gate

```text
PASS: 11 files, 107 tests
```

### Broad Task 1/2 and security regression gate

```text
PASS: 21 files, 175 tests
```

The broad gate includes canonical record access, CRM CRUD/query/move/task behavior, opportunity transitions, inventory drift, AI middleware, fresh CRM context/client access, RBAC/client auth, email inbound/projection, custom record filters/validation, activation/assignment/stage automation, reminder cron, and the CRM cron worker.

### Static and review checks

- `git diff --check`: clean.
- Full Node 24 `pnpm run typecheck`: 865 existing repository diagnostics outside this review.
- Touched-path typecheck filter: zero diagnostics.
- Re-read all 33 review-round source and test files end-to-end, including the canonical inventory and every late portal edit.
- Confirmed server imports use `~~/server`, mutation decisions use authoritative client state, denial paths disclose no hidden names/counts/IDs/provider work, and no unrelated project-wide diagnostic was changed.

## Remaining Concern

- Health and score cron correctness now requires scanning identifier-only candidates before applying an authorized batch limit. This prevents inactive tenants from starving active work and keeps summaries accurate, but a future scale pass may need a resumable per-client candidate cursor without weakening the authority-before-limit invariant.

## Intended Commit

`fix(crm): close indirect authorization review gaps`

---

# Review Round 2 — Idempotent Meeting Target Authority

## Result

- Review base: `5705c62f64ea317edd5e7539e0b2cea78e2ced76`.
- Scope: the remaining meeting-conversion finding only; shared Task 2 task visibility semantics were not changed.
- The idempotent conversion branch now validates the locked task's live protected target reference and authorizes that current target unconditionally in the same transaction before returning the task or action item.
- Missing, malformed, hidden, or cross-client live targets fail with the canonical `404 Record not found` response.

## Behavioral TDD Evidence

- Initial RED before the source edit: 1 file/8 tests, with 5 failures and 3 passes. Both `assigned_to = actor` and `created_by = actor` tasks with hidden live targets were disclosed; absent IDs, malformed target types, and cross-client target references also returned the task instead of the canonical 404. The visible-target control passed.
- Deep review identified PostgreSQL's invalid-UUID error as another malformed-reference disclosure path. A second RED mutation simulation produced 1 failure with 8 passes: the raw `22P02` error escaped instead of returning the canonical 404.
- Final meeting-focused GREEN: 2 files/24 tests.
- Exact Task 3 GREEN: 11 files/107 tests.
- Broad Task 1/2/security/trusted/custom GREEN: 21 files/175 tests.

## Static and Deep Review

- Full Node 24 typecheck retains 865 unrelated repository diagnostics; filtering against the two round-two source/test paths produced zero diagnostics.
- `git diff --check`: clean.
- Re-read `server/utils/crm/meetingBridge.ts` and `test/server/utils/crm/meetingBridgeAuthorization.test.ts` end-to-end after the final edit.
- Confirmed the action item, linked task, and live target are all locked/authorized within the same transaction; denial returns no task/action-item payload; no global task policy, route, database, migration, external service, or deployment behavior changed.

## Intended Commit

`fix(crm): reauthorize idempotent meeting targets`
