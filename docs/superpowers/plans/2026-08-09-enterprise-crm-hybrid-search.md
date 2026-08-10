# Enterprise CRM Hybrid Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an enterprise-safe CRM hybrid-search domain with fresh server-owned authorization, PostgreSQL-authorized semantic join-back, durable versioned indexing, controlled `off`/`shadow`/`assist` rollout, truthful marketing, and guarded non-production verification.

**Architecture:** Neon Postgres remains authoritative for identity, permission, source records, policy, budgets, indexing state, and semantic-candidate authorization. A dedicated Cloudflare Queue and Worker drive identifier-only indexing operations into a dedicated Vectorize index; visible agency and portal search remain keyword-ranked, while only an approved agency AI surface may use weighted RRF. Provider work is default-off, revisioned, budgeted, asynchronously confirmed, auditable, and deployable only from clean content-addressed artifacts.

**Tech Stack:** Nuxt 4, Nitro/H3, Vue 3, Nuxt UI v4, TypeScript, Zod, Vitest, Neon Serverless Postgres, Cloudflare Pages, Workers AI `@cf/baai/bge-base-en-v1.5`, Vectorize, Queues, Wrangler, Node.js 24.18.0.

## Global Constraints

- Implement only in `/Users/paulgiurin/Documents/Projects/dashboard/.worktrees/enterprise-crm-hybrid-search` on `feature/enterprise-crm-hybrid-search`; preserve the user's primary checkout and unrelated changes.
- Treat [the approved design](../specs/2026-08-09-enterprise-crm-hybrid-search-design.md) as the behavioral contract; when code and design conflict, stop and update the design through review before changing behavior.
- Keep production global control `halted`, every client policy `off`, budgets zero, and all visible agency/portal results keyword-ranked.
- Never provision, migrate, deploy, index, shadow-process, or assist in production without the matching explicit approval type.
- Use a dedicated `CRM_SEARCH_VECTORIZE` binding and `CRM_SEARCH_INDEX_QUEUE`; never reuse `VECTORIZE`, `JOBS_QUEUE`, `agency-search`, or `agency-jobs`.
- Derive organisation, client, actor, surface, permissions, and owner visibility server-side through fresh direct-Neon checks; caller values are selectors only.
- Return HTTP `404` with `statusMessage: 'Client not found'` for both missing and inaccessible clients before keyword/policy/budget/provider work.
- Treat Vectorize candidates as untrusted IDs/scores. Response title/subtitle content comes only from currently authorized Postgres rows.
- Accept search queries through JSON POST only; normalize NFKC, remove control/bidi characters, collapse whitespace, cap at 256 code points, and keep identifier-like queries keyword-only.
- Use semantic `topK = 30`, cosine abstention threshold `0.75`, RRF `k = 60`, keyword weight `1.0`, semantic weight `0.7`, keyword pool `50`, final limit `1–50`, and version every ranking constant.
- Use schema `crm-search-v1`, model `@cf/baai/bge-base-en-v1.5`, 768 dimensions, `cls` pooling, a pinned tokenizer, and the exact approved people/company/opportunity allowlists.
- Block indexing until both exact metadata indexes and the non-CRM sentinel readiness gate pass; block new approvals when either independently proven namespace or vector capacity reaches 80%.
- Treat Vectorize writes as asynchronous; mutation acceptance is never equivalent to `indexed` or `deleted` confirmation.
- Never persist raw queries, embedding source text, vector values, unrestricted notes, or provider error bodies in telemetry, queues, metadata, logs, or tool results.
- Run SQL migrations automatically only against the guarded schema-only Neon branch created for this implementation; production/shared database application requires its separate approval.
- Before form-bearing UI work, read and apply the mandatory frontend-design skill; use Nuxt UI v4 components and `UFormField` for every field.
- Follow red-green-refactor, run the focused suite before each commit, re-read every touched file, run the repository deep-review checklist, and commit each independently reviewable task atomically.
- Exact base SHA for typecheck/full-suite comparisons: `f46d1e7793ba558e374c380e47d610a65d42756a`.

---

## File Structure

### Authorization and retrieval

- `server/utils/crm/searchContext.ts` — fresh agency, portal, and agency-AI context resolution.
- `server/utils/crm/recordAccess.ts` — canonical entity/child authorization and SQL visibility predicates.
- `server/utils/crm/recordAccessInventory.ts` — checked classification of every direct and indirect CRM route/service.
- `server/utils/crm/searchRequest.ts` — JSON input normalization, privacy classification, and bounds.
- `server/utils/crm/search.ts` — context-aware deterministic keyword SQL.
- `server/utils/crm/retrieval.ts` — off/shadow/assist coordinator and fallback boundary.
- `server/utils/crm/semanticCandidates.ts` — embedding and Vectorize candidate validation.
- `server/utils/crm/semanticJoinBack.ts` — ledger resolution and authoritative Postgres reload.
- `server/utils/crm/shadowSearch.ts` — bounded `waitUntil` comparison work.
- `server/api/crm/search.post.ts` and `server/api/client-portal/crm/search.post.ts` — POST-only search routes.

### Search-domain and indexing

- `server/database/migrations/350_crm_search_expand.sql` — tables, types, constraints, state functions, and revision columns; no capture triggers.
- `server/database/migrations/351_crm_search_validate_backfill.sql` — fixed scope/control/schema/rate-card seeds and source-revision backfill.
- `server/database/migrations/352_crm_search_activate_capture.sql` — trigger-last capture and teardown activation.
- `server/utils/crm/searchIndex/contracts.ts` — state and provider-independent domain types.
- `server/utils/crm/searchIndex/identity.ts` — namespace/vector ID derivation.
- `server/utils/crm/searchIndex/documents.ts` — canonical allowlisted document construction.
- `server/utils/crm/searchIndex/policy.ts` — restrictive mode/schema-role resolution.
- `server/utils/crm/searchIndex/usage.ts` — admission and conservative cost arithmetic.
- `server/utils/crm/searchIndex/telemetry.ts` — HMAC digest and privacy-safe events.
- `server/utils/crm/searchIndex/*Repository.ts` — policy, source, operation, ledger, usage, and teardown persistence.
- `server/utils/crm/searchIndex/publisher.ts` — dirty expansion and Queue publication.
- `server/utils/crm/searchIndex/provider.ts` — strict Workers AI/Vectorize adapter.
- `server/utils/crm/searchIndex/processor.ts` — serialized provider admission and mutation processing.
- `server/utils/crm/searchIndex/confirmation.ts` and `reconciliation.ts` — exact-ID confirmation and repair.
- `server/utils/crm/searchIndex/backfill.ts`, `teardown.ts`, and `deadLetters.ts` — controlled lifecycle operations.
- `shared/crmSearchIndexProtocol.ts` and `shared/crmSearchIndexSigning.ts` — Worker/Pages protocol and HMAC.
- `workers/crm-search-consumer/` — standalone primary Queue/DLQ consumer and immutable deploy wrapper.

### Governance, operations, and release

- `server/utils/crm/search/evaluation/` — fixture validation, metrics, gates, runner, and persistence.
- `server/utils/crm/search/operations/` — bounded health reads and audited commands.
- `server/api/admin/crm-search/**` — ADMIN-only policy, evaluation, backfill, reconciliation, and DLQ endpoints.
- `app/pages/admin/ai/crm-search.vue` and `app/components/ai/crm-search/**` — safe operations UI.
- `app/utils/marketingClaimManifest.ts` — source/render claim-to-capability contract.
- `scripts/crm-search/` — manifests, preview-binding guard, frozen artifacts, E2E, cleanup, and evidence.
- `docs/runbooks/crm-search-*.md` — indexing, operations, evaluation, preview E2E, and staged rollout.

### Deliberately unchanged behavior

- Existing shared `VECTORIZE` data and helper consumers remain untouched.
- Portal and agency-global visible ranking remain keyword-only.
- Activities/tasks remain out of the embedding projection.
- Production resource state remains unchanged during implementation.

---

### Task 1: Freeze the CRM Authorization Inventory and Fresh Search Context

**Files:**
- Create: `server/utils/crm/recordAccessInventory.ts`
- Create: `server/utils/crm/searchContext.ts`
- Create: `test/config/crmRecordAuthorizationInventory.test.ts`
- Create: `test/server/utils/crm/searchContext.test.ts`
- Modify: `server/utils/clientAuth.ts`
- Modify: `server/api/agency/clients/[id].put.ts`
- Modify: `server/api/agency/clients/[id].delete.ts`
- Test: `test/server/utils/crm/clientCrmAccess.test.ts`

**Interfaces:**
- Consumes: `H3Event`, `ToolContext`, `queryOneFresh`, `queryRowsFresh`, active staff/client/portal records, current role groups, CRM settings, and assistant assignments.
- Produces: `CrmSearchContext`, `resolveAgencyCrmSearchContext`, `resolvePortalCrmSearchContext`, `resolveAgencyAiCrmContext`, and the exhaustive `CRM_RECORD_ACCESS_SURFACE_INVENTORY` covering routes, registered AI tools, cron/queue services, and indirect writers/readers.

- [ ] **Step 1: Write failing inventory and fresh-context tests**

```ts
it('returns the same denial for a missing and inaccessible client before retrieval', async () => {
  const deps = fakeAgencyContextDeps({ client: null })
  await expect(resolveAgencyCrmSearchContext(fakeEvent(), { clientId, surface: 'agency_global' }, deps))
    .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Client not found' })
  expect(deps.runKeyword).not.toHaveBeenCalled()
})

it('classifies every record-bearing CRM route and registered service and rejects drift', () => {
  expect(scanCrmRecordSurfaces()).toEqual([...CRM_RECORD_ACCESS_SURFACE_INVENTORY].sort())
})
```

- [ ] **Step 2: Run the red tests**

Run: `pnpm exec vitest run test/config/crmRecordAuthorizationInventory.test.ts test/server/utils/crm/searchContext.test.ts test/server/utils/crm/clientCrmAccess.test.ts`

Expected: FAIL because the inventory and fresh resolvers do not exist and inactive clients are not yet rejected.

- [ ] **Step 3: Implement the fresh context contract**

```ts
export interface CrmSearchContext {
  organisationScopeId: string
  clientId: string
  correlationId: string
  actorType: 'staff' | 'portal'
  actorId: string
  surface: 'agency_global' | 'portal_global' | 'agency_ai'
  permissionSet: readonly string[]
  visibility: { ownerScoped: boolean }
  assistantScope?: { clientIds: readonly string[]; sourceRevision: string }
}

export type AgencyAiContextResolution =
  | { status: 'resolved'; context: CrmSearchContext; clientName: string }
  | { status: 'not_found' | 'ambiguous' | 'scope_unavailable' }
```

Use fresh direct-Neon reads for actor/session active state, role groups, `CLIENTS`, active client, owner policy, portal entitlement/view permission, and assistant assignment intersection. Generate a server UUID correlation ID for every external route/tool request, ignore caller-supplied correlation IDs, and propagate it without turning it into a metric label. Client deactivation revokes portal sessions in the same transaction.

- [ ] **Step 4: Run focused and regression tests**

Run: `pnpm exec vitest run test/config/crmRecordAuthorizationInventory.test.ts test/server/utils/crm/searchContext.test.ts test/server/utils/crm/clientCrmAccess.test.ts test/config/clientCrmRbacContract.test.ts`

Expected: PASS, including identical 404 response shape and zero retrieval/provider calls after denial.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/recordAccessInventory.ts server/utils/crm/searchContext.ts server/utils/clientAuth.ts server/api/agency/clients test/config/crmRecordAuthorizationInventory.test.ts test/server/utils/crm/searchContext.test.ts test/server/utils/crm/clientCrmAccess.test.ts
git commit -m "feat(crm): add fresh CRM search authority context"
```

---

### Task 2: Enforce Shared Record Authorization on Core CRM CRUD

**Files:**
- Create: `server/utils/crm/recordAccess.ts`
- Create: `test/server/utils/crm/recordAccess.test.ts`
- Create: `test/server/api/crmOwnerScopeCrud.test.ts`
- Modify: `server/utils/crm/queryScope.ts`
- Modify: `server/api/crm/people/index.get.ts`
- Modify: `server/api/crm/people/index.post.ts`
- Modify: `server/api/crm/people/[id].get.ts`
- Modify: `server/api/crm/people/[id].patch.ts`
- Modify: `server/api/crm/people/[id].delete.ts`
- Modify: `server/api/crm/companies/index.get.ts`
- Modify: `server/api/crm/companies/index.post.ts`
- Modify: `server/api/crm/companies/[id].get.ts`
- Modify: `server/api/crm/companies/[id].patch.ts`
- Modify: `server/api/crm/companies/[id].delete.ts`
- Modify: `server/api/crm/opportunities/index.get.ts`
- Modify: `server/api/crm/opportunities/index.post.ts`
- Modify: `server/api/crm/opportunities/[id].get.ts`
- Modify: `server/api/crm/opportunities/[id].patch.ts`
- Modify: `server/api/crm/opportunities/[id].delete.ts`
- Modify: `server/api/crm/opportunities/[id]/move.patch.ts`
- Modify: `server/utils/crm/opportunityStageTransition.ts`
- Modify: `server/api/crm/activities/index.get.ts`
- Modify: `server/api/crm/activities/index.post.ts`
- Modify: `server/api/crm/activities/[id].patch.ts`
- Modify: `server/api/crm/activities/[id].delete.ts`
- Modify: `server/api/crm/tasks/index.get.ts`
- Modify: `server/api/crm/tasks/index.post.ts`
- Modify: `server/api/crm/tasks/[id].patch.ts`
- Modify: `server/api/crm/tasks/[id].delete.ts`

**Interfaces:**
- Consumes: `CrmSearchContext`, entity IDs, and an optional `TransactionClient`.
- Produces: `crmVisibilityCond`, `requireCrmRecordAccess`, `requireAllCrmRecordsAccess`, and current authoritative records.

- [ ] **Step 1: Write failing entity and handler tests**

```ts
it.each(['person', 'company', 'opportunity'] as const)('hides a known %s ID outside owner scope', async type => {
  await expect(requireCrmRecordAccess(ownerContext, { type, id: hiddenId }, deps))
    .rejects.toMatchObject({ statusCode: 404, statusMessage: 'Record not found' })
})

it('inherits activity and task visibility from current client-qualified targets', async () => {
  expect(await requireCrmRecordAccess(ownerContext, hiddenTargetActivity, deps)).toBeRejected()
  expect(await requireCrmRecordAccess(ownerContext, assignedTask, deps)).toBeAllowed()
})
```

- [ ] **Step 2: Run the red tests**

Run: `pnpm exec vitest run test/server/utils/crm/recordAccess.test.ts test/server/api/crmOwnerScopeCrud.test.ts test/crm/queryScope.test.ts`

Expected: FAIL because known-ID and activity/task routes bypass owner visibility.

- [ ] **Step 3: Implement the resolver and apply it to every listed route**

```ts
export type CrmRecordType = 'person' | 'company' | 'opportunity' | 'activity' | 'task'
export interface CrmRecordRef { type: CrmRecordType; id: string }

export async function requireAllCrmRecordsAccess(
  context: CrmSearchContext,
  refs: readonly CrmRecordRef[],
  client: TransactionClient
): Promise<readonly AuthoritativeCrmRecord[]> {
  const rows = await loadAndLockQualifiedRecords(context, refs, client)
  if (rows.length !== refs.length) throw recordNotFound()
  return rows
}
```

People/company/opportunity owner rules use `(owner_id = actorId OR assigned_to = actorId)`. Activities authorize their target. Tasks require actor assignment/creation or a visible target. Mutations load/lock authorization inside the same transaction before writing.

- [ ] **Step 4: Run focused CRUD regressions**

Run: `pnpm exec vitest run test/server/utils/crm/recordAccess.test.ts test/server/api/crmOwnerScopeCrud.test.ts test/crm/queryScope.test.ts test/server/api/crmOpportunityMove.test.ts test/crm/tasks.test.ts`

Expected: PASS with identical hidden/missing responses and no partial mutation.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/recordAccess.ts server/utils/crm/queryScope.ts server/api/crm/people server/api/crm/companies server/api/crm/opportunities server/api/crm/activities server/api/crm/tasks server/utils/crm/opportunityStageTransition.ts test/server/utils/crm/recordAccess.test.ts test/server/api/crmOwnerScopeCrud.test.ts
git commit -m "fix(crm): enforce owner scope on core records"
```

---

### Task 3: Close Indirect CRM Record-Access Bypasses

**Files:**
- Create: `test/server/api/crmOwnerScopeBatchSurfaces.test.ts`
- Create: `test/server/api/crmOwnerScopeChildren.test.ts`
- Create: `test/server/api/crmOwnerScopeAggregates.test.ts`
- Create: `test/server/api/crmOwnerScopeIndirectPaths.test.ts`
- Create: `test/crm/targets.test.ts`
- Modify: `server/api/crm/bulk.post.ts`, `server/utils/crm/bulk.ts`
- Modify: `server/api/crm/dedupe/merge.post.ts`, `server/api/crm/dedupe/suggestions.get.ts`, `server/utils/crm/dedupe.ts`
- Modify: `server/api/crm/people/import.post.ts`, `server/utils/crm/csv.ts`
- Modify: `server/api/crm/export.get.ts`, `server/utils/crm/exportRecords.ts`
- Modify: `server/api/crm/documents/index.get.ts`, `server/api/crm/documents/index.post.ts`, `server/api/crm/documents/[id].delete.ts`, `server/api/crm/documents/[id]/download.get.ts`, `server/utils/crm/documentsDb.ts`
- Modify: `server/api/crm/communications/index.get.ts`, `server/api/crm/communications/index.post.ts`, `server/api/crm/communications/[id].delete.ts`, `server/utils/crm/commsDb.ts`
- Modify: `server/api/crm/relationships/index.get.ts`, `server/api/crm/relationships/index.post.ts`, `server/api/crm/relationships/[id].delete.ts`, `server/utils/crm/relationshipsDb.ts`
- Modify: `server/api/crm/line-items/index.get.ts`, `server/api/crm/line-items/index.post.ts`, `server/api/crm/line-items/[id].patch.ts`, `server/api/crm/line-items/[id].delete.ts`, `server/utils/crm/lineItemsDb.ts`
- Modify: `server/api/crm/audit/index.get.ts`
- Modify: `server/api/crm/pipeline.get.ts`, `server/api/crm/analytics/adoption.get.ts`, `server/api/crm/analytics/forecast.get.ts`, `server/api/crm/analytics/funnel.get.ts`, `server/api/crm/analytics/performance.get.ts`, `server/api/crm/analytics/summary.get.ts`
- Modify: `server/api/crm/targets/index.get.ts`, `server/api/crm/targets/index.post.ts`
- Modify: `server/api/crm/targets/[id].delete.ts`, `server/api/crm/targets/leaderboard.get.ts`
- Modify: `server/utils/crm/targetsDb.ts`
- Modify: `server/api/crm/health/at-risk.get.ts`, `server/api/crm/health/compute.post.ts`, `server/api/crm/health/index.get.ts`, `server/utils/crm/healthSignals.ts`
- Modify: `server/api/crm/scoring/compute.post.ts`, `server/api/crm/scoring/index.get.ts`, `server/utils/crm/scoreSignals.ts`
- Modify: `server/api/crm/ai/draft-followup.post.ts`, `server/api/crm/ai/next-best-action.get.ts`, `server/api/crm/ai/status.get.ts`, `server/utils/crm/aiSignals.ts`
- Modify: `server/api/crm/people/[id]/meeting-actions.get.ts`, `server/api/crm/companies/[id]/meeting-actions.get.ts`
- Modify: `server/api/crm/meeting-actions/[actionItemId]/convert.post.ts`, `server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-candidates.get.ts`, `server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-task.post.ts`, `server/utils/crm/meetingBridge.ts`
- Modify: `server/api/crm/opportunities/[id]/create-quote.post.ts`, `server/api/crm/quotes.get.ts`, `server/utils/crm/oppQuote.ts`
- Modify: `server/api/crm/assignment-rules/index.get.ts`, `server/api/crm/assignment-rules/index.post.ts`, `server/api/crm/assignment-rules/[id].delete.ts`, `server/utils/crm/assignment.ts`
- Modify: `server/api/crm/stage-automations/index.get.ts`, `server/api/crm/stage-automations/index.post.ts`, `server/api/crm/stage-automations/[id].patch.ts`, `server/api/crm/stage-automations/[id].delete.ts`, `server/utils/crm/stageAutomation.ts`
- Modify: `server/api/internal/workflows/crm/followup-review.post.ts`, `server/api/cron/crm-task-reminders.post.ts`, `server/utils/crm/lifecycle.ts`, `server/utils/crm/activation.ts`, `server/utils/crm/emailCommunicationProjection.ts`
- Modify: `server/utils/leads/crmPromotion.ts`, `server/utils/leads/dispatch.ts`, `server/utils/crm/emailInboundProcessor.ts`
- Modify: `server/utils/ai/tools/crmActions.ts`, `server/utils/ai/tools/index.ts`, `test/ai/crmActions.test.ts`
- Modify: `server/api/crm/records/index.get.ts`, `server/api/crm/records/index.post.ts`, `server/api/crm/records/[id].get.ts`, `server/api/crm/records/[id].patch.ts`, `server/api/crm/records/[id].delete.ts`, `server/api/crm/records/[id]/move.patch.ts`, `server/utils/crm/engine/recordFilter.ts`, `server/utils/crm/engine/recordWrite.ts`, `server/utils/crm/engine/validateRecord.ts`

**Interfaces:**
- Consumes: the Task 2 record resolver, actor contexts, trusted-system contexts, and transactions.
- Produces: atomic batch authorization, parent-inherited child authorization, filtered aggregates/exports, dual-visible dedupe pairs, and reauthorized indirect writes.

- [ ] **Step 1: Write failing indirect-surface tests**

```ts
it('rejects the entire bulk mutation when one target is hidden', async () => {
  await expect(runBulk(context, [visibleId, hiddenId], mutation, tx)).rejects.toMatchObject({ statusCode: 404 })
  expect(tx.execute).not.toHaveBeenCalled()
})

it('never forms a dedupe pair unless both records are visible', async () => {
  expect(await findDedupeSuggestions(ownerContext, deps)).toEqual([])
})

it('filters leaderboard amounts and attainment before aggregation', async () => {
  expect(await loadLeaderboard(ownerContext, deps)).not.toContainEqual(expect.objectContaining({ ownerId: hiddenOwnerId }))
})

it('does not disclose a client or record through CRM AI resolution or disambiguation', async () => {
  await expect(proposeOpportunity(hiddenArgs, actorContext, deps)).resolves.toEqual({ ok: false, error: 'No matching client.' })
  expect(deps.propose).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the red tests**

Run: `pnpm exec vitest run test/server/api/crmOwnerScopeBatchSurfaces.test.ts test/server/api/crmOwnerScopeChildren.test.ts test/server/api/crmOwnerScopeAggregates.test.ts test/server/api/crmOwnerScopeIndirectPaths.test.ts`

Expected: FAIL on known-ID children, cross-record pairs, unfiltered aggregates, meetings, quotes, or lead promotion.

- [ ] **Step 3: Thread canonical authorization through every listed surface**

Preauthorize all bulk IDs inside one transaction; require both dedupe records; authorize child parents and both relationship endpoints; filter before aggregate/export projection; require actor-scoped meeting/quote targets; give cron/queue work an explicit trusted-system client scope; reauthorize actor-visible results; validate custom-object relation fields against protected targets. Registered CRM action/draft tools require `CLIENTS`, use the fresh CRM-specific context rather than global `agency_clients` resolution, filter every record match through `requireCrmRecordAccess`, and return disambiguation options only after authorization; proposal confirmation reauthorizes inside the mutation transaction.

```ts
const records = await requireAllCrmRecordsAccess(context, refs, tx)
if (records.length !== refs.length) throw recordNotFound()
await applyBulkMutation(tx, records.map(record => record.id), operation)
```

- [ ] **Step 4: Run focused and existing regressions**

Run: `pnpm exec vitest run test/server/api/crmOwnerScopeBatchSurfaces.test.ts test/server/api/crmOwnerScopeChildren.test.ts test/server/api/crmOwnerScopeAggregates.test.ts test/server/api/crmOwnerScopeIndirectPaths.test.ts test/crm/bulk.test.ts test/crm/dedupe.test.ts test/crm/meetingBridge.rankTargets.test.ts test/crm/oppQuote.test.ts test/crm/targets.test.ts test/ai/crmActions.test.ts test/server/utils/leads/crmPromotion.test.ts`

Expected: PASS with no hidden record names, counts, children, candidates, or linked IDs.

- [ ] **Step 5: Deep-review the inventory and commit**

```bash
git add server/api/crm server/api/office server/api/internal/workflows/crm/followup-review.post.ts server/api/cron/crm-task-reminders.post.ts server/utils/crm server/utils/leads server/utils/ai/tools/crmActions.ts server/utils/ai/tools/index.ts test/crm/targets.test.ts test/ai/crmActions.test.ts test/server/api/crmOwnerScopeBatchSurfaces.test.ts test/server/api/crmOwnerScopeChildren.test.ts test/server/api/crmOwnerScopeAggregates.test.ts test/server/api/crmOwnerScopeIndirectPaths.test.ts
git commit -m "fix(crm): close indirect owner-scope bypasses"
```

---

### Task 4: Replace GET Search with Hardened POST Keyword Search

**Files:**
- Create: `server/utils/crm/searchRequest.ts`
- Create: `test/crm/searchRequest.test.ts`
- Create: `server/api/crm/search.post.ts`
- Create: `server/api/client-portal/crm/search.post.ts`
- Create: `test/server/api/crmSearchEndpoints.test.ts`
- Create: `test/config/clientPortalCrmBoundary.test.ts`
- Create: `test/components/crmGlobalSearch.test.ts`
- Modify: `server/utils/crm/search.ts`
- Modify: `server/utils/crm/clientCrmAccess.ts`
- Modify: `server/middleware/04-client-crm-access.ts`
- Modify: `server/utils/ai/tools/searchCrm.ts`
- Modify: `test/ai/tools/searchCrm.test.ts`
- Modify: `server/utils/godMode/internalExecutionDelegation.ts`
- Modify: `test/server/utils/godModeInternalExecutionDelegation.test.ts`
- Modify: `test/server/utils/aiInternalFetchInventory.test.ts`
- Modify: `app/components/crm/GlobalSearch.client.vue`
- Delete: `server/api/crm/search.get.ts`
- Delete: `server/api/client-portal/crm/search.get.ts`
- Delete: `server/api/agency/search/semantic.get.ts`
- Test: `test/crm/search.test.ts`
- Test: `test/server/utils/crm/clientCrmAccess.test.ts`

**Interfaces:**
- Consumes: canonical `CrmSearchContext` and JSON `{ clientId?, query, limit? }`.
- Produces: `normalizeCrmSearchRequest`, deterministic `buildSearchQuery(context, normalizedTerm, poolLimit)`, POST-only routes, and a direct authorized keyword AI tool with no internal HTTP hop.

- [ ] **Step 1: Read the mandatory frontend-design skill, then write failing request, caller, route, and absence tests**

Run before editing the command-palette form: `sed -n '1,240p' ~/.Codex/plugins/marketplaces/Codex-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`

```ts
expect(normalizeCrmSearchRequest({ query: '  Ａcme\u202e  ', limit: 500 })).toEqual({
  query: 'Acme', limit: 50, semanticEligible: true
})
expect(keywordSql).toMatch(/ORDER BY rank DESC, title ASC, type ASC, id ASC LIMIT/)
expect(routeFiles).not.toContain('server/api/agency/search/semantic.get.ts')
expect(normalizeCrmSearchRequest({ query: 'ｕｓｅｒ＠ｅｘａｍｐｌｅ．ｃｏｍ' }).semanticEligible).toBe(false)
expect(fetchMock).toHaveBeenCalledWith('/api/crm/search', {
  method: 'POST', body: { clientId, query: 'Acme' }
})
```

Privacy cases include full-width and mixed-script email/phone/UUID forms, bidi/control characters, high-entropy tokens, post-normalization overflow, pinned-tokenizer overflow, and versioned classifier output.

- [ ] **Step 2: Run the red tests**

Run: `pnpm exec vitest run test/crm/search.test.ts test/crm/searchRequest.test.ts test/components/crmGlobalSearch.test.ts test/server/api/crmSearchEndpoints.test.ts test/server/utils/crm/clientCrmAccess.test.ts test/config/clientPortalCrmBoundary.test.ts test/config/crmRecordAuthorizationInventory.test.ts test/ai/tools/searchCrm.test.ts test/server/utils/godModeInternalExecutionDelegation.test.ts test/server/utils/aiInternalFetchInventory.test.ts`

Expected: FAIL because routes are GET, input is only trimmed, and the portal POST classifier requires edit.

- [ ] **Step 3: Implement POST-only keyword behavior**

Use strict Zod JSON bodies, a versioned NFKC/control/bidi/whitespace normalizer and privacy classifier, post-normalization code-point bounds, identifier/high-entropy classification, fresh contexts, stable pool size 50, and the existing `CrmSearchHit` response shape. Tokenize otherwise eligible queries with the pinned schema tokenizer and keep inputs over 512 tokens keyword-only. Convert `CrmGlobalSearch` to explicit JSON POST: agency sends server-treated selector `clientId`, portal omits it, and neither puts query text in the URL. Classify exactly `POST /api/client-portal/crm/search` as `view`; every near-match POST remains `edit`. Replace the AI tool's GET/internal-fetch path with `resolveAgencyAiCrmContext` plus direct keyword retrieval; unresolved/ambiguous status returns a non-disclosing failed `ToolResult`. Remove CRM search from the God-mode internal read allowlist and inventory, and make a repository-wide caller scan fail on any remaining GET/query-style search caller.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec vitest run test/crm/search.test.ts test/crm/searchRequest.test.ts test/components/crmGlobalSearch.test.ts test/server/api/crmSearchEndpoints.test.ts test/server/utils/crm/clientCrmAccess.test.ts test/config/clientPortalCrmBoundary.test.ts test/config/clientCrmRbacContract.test.ts test/ai/tools/searchCrm.test.ts test/server/utils/godModeInternalExecutionDelegation.test.ts test/server/utils/aiInternalFetchInventory.test.ts`

Expected: PASS; old GET and unsafe semantic files are absent with no alias.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/search.ts server/utils/crm/searchRequest.ts server/utils/crm/clientCrmAccess.ts server/middleware/04-client-crm-access.ts server/api/crm server/api/client-portal/crm server/api/agency/search server/utils/ai/tools/searchCrm.ts server/utils/godMode/internalExecutionDelegation.ts app/components/crm/GlobalSearch.client.vue test/crm/search.test.ts test/crm/searchRequest.test.ts test/components/crmGlobalSearch.test.ts test/server/api/crmSearchEndpoints.test.ts test/server/utils/crm/clientCrmAccess.test.ts test/config/clientPortalCrmBoundary.test.ts test/ai/tools/searchCrm.test.ts test/server/utils/godModeInternalExecutionDelegation.test.ts test/server/utils/aiInternalFetchInventory.test.ts
git commit -m "feat(crm): harden POST keyword search"
```

---

### Task 5: Add the Search-Domain Expand Migration

**Files:**
- Create: `server/database/migrations/350_crm_search_expand.sql`
- Create: `test/config/crmSearchExpandMigration.test.ts`
- Create: `test/config/crmSearchGovernancePostgres.test.ts`
- Create: `test/fixtures/crm-search-documents.json`

**Interfaces:**
- Consumes: existing CRM source tables and PostgreSQL functions/extensions already available in the repository.
- Produces: all search-domain tables, constraints, revision columns, state functions, normalization/projection functions, and zero/default control policy; no source triggers.

- [ ] **Step 1: Write failing migration contract tests**

```ts
expect(sql).toContain('CREATE TABLE IF NOT EXISTS crm_search_global_control')
expect(sql).toContain("DEFAULT 'halted'")
expect(sql).toMatch(/daily_query_budget_usd_micros BIGINT NOT NULL DEFAULT 0/)
expect(sql).not.toMatch(/CREATE TRIGGER crm_search_capture_/)
expect(sql).not.toMatch(/ON DELETE CASCADE[\s\S]{0,120}crm_search_(source_dirty|documents|client_teardowns)/)
expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_expire_governed_rows')
expect(sql).toContain('SECURITY DEFINER')
expect(sql).toContain('CREATE OR REPLACE FUNCTION crm_search_record_evaluation_run')
```

- [ ] **Step 2: Run the red test**

Run: `pnpm exec vitest run test/config/crmSearchExpandMigration.test.ts`

Expected: FAIL because migration 350 does not exist.

- [ ] **Step 3: Implement the transactional expand migration**

Create organisation/global control/namespaces/schema versions/rate cards/policies/source dirty/operations/documents/usage/events/daily events/evaluation approval+revocation/change approval+revocation/dead letters/teardown+vectors/audit/legal hold/retention attestation structures. Add narrowly granted `SECURITY DEFINER` functions for legal-hold/high-watermark-checked retention with chained attestations and for server-side evaluation-gate recomputation; revoke ordinary update/delete/truncate paths on governed evidence. Dead letters carry a constrained `origin` of `cloudflare_transport` or `provider_confirmation` with disjoint legal transitions. Add `search_revision BIGINT NOT NULL DEFAULT 0` to people, companies, and opportunities. Enforce non-cascading identity, partial unique operation bounds, immutable governance, and explicit state checks.

- [ ] **Step 4: Run static and disposable-schema tests**

Run: `CRM_SEARCH_TEST_DATABASE_URL="$CRM_SEARCH_TEST_DATABASE_URL" pnpm exec vitest run test/config/crmSearchExpandMigration.test.ts test/config/crmSearchGovernancePostgres.test.ts`

Expected: PASS when the guarded test URL is present; database block skips cleanly otherwise. No production/shared URL is accepted.

- [ ] **Step 5: Re-read the SQL and commit**

```bash
git add server/database/migrations/350_crm_search_expand.sql test/config/crmSearchExpandMigration.test.ts test/config/crmSearchGovernancePostgres.test.ts test/fixtures/crm-search-documents.json
git commit -m "feat(crm-search): add search-domain schema"
```

---

### Task 6: Seed, Validate, and Activate Durable Capture

**Files:**
- Create: `server/database/migrations/351_crm_search_validate_backfill.sql`
- Create: `server/database/migrations/352_crm_search_activate_capture.sql`
- Create: `test/config/crmSearchValidateBackfillMigration.test.ts`
- Create: `test/config/crmSearchCaptureMigration.test.ts`
- Create: `test/config/crmSearchMigrationPostgres.test.ts`

**Interfaces:**
- Consumes: migration 350 objects and shared document fixtures.
- Produces: fixed installation scope, halted global control, `crm-search-v1`, rate card, backfilled revisions, capture triggers, client-move dual intent, and teardown snapshots.

- [ ] **Step 1: Write failing seed/trigger tests**

```ts
expect(validateSql).toContain("'crm-search-v1'")
expect(validateSql).toContain("'@cf/baai/bge-base-en-v1.5'")
expect(captureSql).toContain("SET LOCAL lock_timeout = '5s'")
expect(captureSql).toContain('crm_search_capture_person_change')
expect(captureSql).toContain('OLD.client_id IS DISTINCT FROM NEW.client_id')
```

Database cases must assert trigger absence after 350/351, presence only after 352, rollback leaves no dirty row, insert/update/soft-delete/physical-delete sequence, OLD-delete+NEW-upsert on client move, and teardown survival after source/client/policy deletion.
Use two independent database connections to prove a source write cannot commit through candidate validation/role swap, and that a client move locks OLD/NEW client keys in deterministic order without deadlock.

- [ ] **Step 2: Run the red tests**

Run: `pnpm exec vitest run test/config/crmSearchValidateBackfillMigration.test.ts test/config/crmSearchCaptureMigration.test.ts test/config/crmSearchMigrationPostgres.test.ts`

Expected: FAIL because migrations 351/352 do not exist.

- [ ] **Step 3: Implement validation and trigger-last activation**

Use the migration advisory lock, `SET LOCAL lock_timeout = '5s'`, and `SET LOCAL statement_timeout = '60s'`. Every indexed-source capture trigger also acquires the client-scoped shared transaction advisory lock; client moves acquire OLD/NEW shared locks in canonical byte order. Promotion later takes the matching exclusive lock. Keep trigger functions source-specific, schema-neutral, transaction-local, revision-owned, and free of policy/provider calls.

- [ ] **Step 4: Run the disposable Postgres suite**

Run: `CRM_SEARCH_TEST_DATABASE_URL="$CRM_SEARCH_TEST_DATABASE_URL" pnpm exec vitest run test/config/crmSearchExpandMigration.test.ts test/config/crmSearchValidateBackfillMigration.test.ts test/config/crmSearchCaptureMigration.test.ts test/config/crmSearchMigrationPostgres.test.ts`

Expected: PASS against the guarded test database; applying migrations twice remains safe where declared idempotent.

- [ ] **Step 5: Re-read both SQL files and commit**

```bash
git add server/database/migrations/351_crm_search_validate_backfill.sql server/database/migrations/352_crm_search_activate_capture.sql test/config/crmSearchValidateBackfillMigration.test.ts test/config/crmSearchCaptureMigration.test.ts test/config/crmSearchMigrationPostgres.test.ts
git commit -m "feat(crm-search): activate durable source capture"
```

---

### Task 7: Implement Deterministic Search and Index Primitives

**Files:**
- Create: `server/utils/crm/searchIndex/contracts.ts`
- Create: `server/utils/crm/searchIndex/identity.ts`
- Create: `server/utils/crm/searchIndex/documents.ts`
- Create: `server/utils/crm/searchIndex/policy.ts`
- Create: `server/utils/crm/searchIndex/usage.ts`
- Create: `server/utils/crm/searchIndex/telemetry.ts`
- Create: `server/utils/crm/ranking.ts`
- Create: `test/crm/searchIndex/identity.test.ts`
- Create: `test/crm/searchIndex/documents.test.ts`
- Create: `test/crm/searchIndex/policy.test.ts`
- Create: `test/crm/searchIndex/usage.test.ts`
- Create: `test/crm/searchIndex/telemetry.test.ts`
- Create: `test/crm/ranking.test.ts`

**Interfaces:**
- Consumes: WebCrypto, the checked document fixture, the pinned schema/model/tokenizer/rate-card contract, and server-owned IDs.
- Produces: deterministic namespace/vector IDs, canonical documents, effective mode, provider admission arithmetic, versioned RRF, query digests, and privacy-safe event rows.

- [ ] **Step 1: Write failing pure tests**

```ts
expect(await deriveCrmSearchNamespace({ organisationScopeId, clientId })).toMatch(/^[A-Za-z0-9_-]+$/)
expect(Buffer.byteLength(namespace)).toBeLessThanOrEqual(64)
expect(document.canonicalText).not.toMatch(/@|phone|notes-secret/i)
expect(resolveEffectiveCrmSearchMode({
  globalState: 'enabled', globalMaximum: 'shadow', policyMode: 'assist',
  surface: 'agency_ai', infrastructureReady: true
})).toBe('shadow')
expect(vectorizeUsage({ queryVectors: 1, insertedVectors: 0, dimensions: 768, topK: 30 }).queryDimensions)
  .toBe(768)
expect(forecastCrmSearchCapacity(capacityInput)).toMatchObject({ namespaceHeadroom: expect.any(Number), vectorHeadroom: expect.any(Number) })
expect(reciprocalRankFusion({ keyword, semantic, finalLimit: 10 }).map(hit => hit.key)).toEqual(expectedOrder)
```

- [ ] **Step 2: Run the red tests**

Run: `pnpm exec vitest run test/crm/searchIndex/identity.test.ts test/crm/searchIndex/documents.test.ts test/crm/searchIndex/policy.test.ts test/crm/searchIndex/usage.test.ts test/crm/searchIndex/telemetry.test.ts test/crm/ranking.test.ts`

Expected: FAIL because the primitive modules do not exist.

- [ ] **Step 3: Implement exact pure contracts**

```ts
export type CrmSearchEntityType = 'person' | 'company' | 'opportunity'
export type CrmSearchMode = 'off' | 'shadow' | 'assist'
export type CrmSearchPolicyState = 'off' | 'indexing' | 'shadow' | 'assist' | 'teardown_pending'
export type CrmSearchGlobalState = 'halted' | 'delete_only' | 'enabled'
export type CrmSearchSchemaRole = 'active' | 'candidate' | 'retiring'

export function buildCrmSearchDocument(entity: CrmSearchDocumentSource): {
  canonicalText: string
  contentHash: string
  providerInput: string
}

export const CRM_SEARCH_V1_FIELDS = {
  person: ['first_name', 'last_name', 'job_title', 'department', 'lifecycle_stage'],
  company: ['name', 'domain', 'lifecycle_stage'],
  opportunity: ['name', 'status', 'source']
} as const
```

Use SHA-256 base64url IDs, collision-checkable input tuples, exact field labels/order and approved per-field bounds, a 1,000-code-point pre-tokenizer cap, NFKC/control normalization, deterministic 512-token truncation including special tokens, HMAC-SHA-256 telemetry, and Vectorize dimension accounting without a `topK` price multiplier. Provider metadata is only entity type, schema version, source revision, keyed confirmation tag, and key version; only entity type/schema are indexed. RRF deduplicates each source by entity key retaining its best one-based rank, fuses complete pools before limiting, assigns zero absent-list contribution, and breaks ties by keyword rank, semantic rank, entity type, then entity ID, with absent ranks last; constants, pools, rank base, and dedupe revision are pinned. Forecast namespace and vector capacity independently across active/candidate/retiring/sentinel/deletion-pending inventory; unknown limits fail closed. Metric labels are allowlisted bounded enums and never include actor/client/query/correlation IDs, URLs, or error text.

- [ ] **Step 4: Run pure suites and SQL/TS fixture parity**

Run: `pnpm exec vitest run test/crm/searchIndex test/crm/ranking.test.ts test/config/crmSearchValidateBackfillMigration.test.ts`

Expected: PASS with byte-equivalent SQL/TypeScript canonical pre-tokenizer fixtures.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/searchIndex server/utils/crm/ranking.ts test/crm/searchIndex test/crm/ranking.test.ts test/fixtures/crm-search-documents.json
git commit -m "feat(crm-search): add deterministic search primitives"
```

---

### Task 8: Add Fresh Policy, Usage, Operation, and Ledger Repositories

**Files:**
- Create: `server/utils/crm/searchIndex/repository.ts`
- Create: `server/utils/crm/searchIndex/policyRepository.ts`
- Create: `server/utils/crm/searchIndex/sourceRepository.ts`
- Create: `server/utils/crm/searchIndex/operationRepository.ts`
- Create: `server/utils/crm/searchIndex/documentRepository.ts`
- Create: `server/utils/crm/searchIndex/usageRepository.ts`
- Create: `server/utils/crm/searchIndex/teardownRepository.ts`
- Create: `server/utils/crm/searchIndex/namespaceRepository.ts`
- Create: `server/utils/crm/searchIndex/approvalRepository.ts`
- Create: `server/utils/crm/searchIndex/telemetryRepository.ts`
- Create: `test/crm/searchIndex/policyRepository.test.ts`
- Create: `test/crm/searchIndex/sourceRepository.test.ts`
- Create: `test/crm/searchIndex/operationRepository.test.ts`
- Create: `test/crm/searchIndex/usageRepository.test.ts`
- Create: `test/crm/searchIndex/teardownRepository.test.ts`
- Create: `test/crm/searchIndex/namespaceRepository.test.ts`
- Create: `test/crm/searchIndex/approvalRepository.test.ts`
- Create: `test/crm/searchIndex/telemetryRepository.test.ts`

**Interfaces:**
- Consumes: migration tables, `queryOneFresh`, `queryRowsFresh`, `transactionWithoutRetry`, and Task 7 types.
- Produces: control/policy reads, atomic admission, dirty/operation claims, document CAS, teardown authorization, immutable approval/revocation validation, privacy-safe event/aggregate writes, and release/settlement.

- [ ] **Step 1: Write failing repository tests**

```ts
it('locks global and client usage together and rejects either exceeded cap', async () => {
  await expect(reserveCrmSearchUsage(overBudgetInput, tx)).rejects.toThrow('crm_search_budget_exhausted')
})

it('charges the full 512-token reservation once a Workers AI call is sent', async () => {
  const reservation = await reserveCrmSearchUsage(queryInput, tx)
  await settleCrmSearchUsage(reservation, { providerCallSent: true, completion: 'late_discarded' }, tx)
  expect(await loadChargedTokens(reservation.id, tx)).toBe(512)
})

it('allows at most one provider-pending operation and one coalesced successor', async () => {
  await insertPending(operationV1, tx)
  await upsertSuccessor(operationV2, tx)
  await upsertSuccessor(operationV3, tx)
  expect(await loadOperations(entityKey, tx)).toMatchObject([operationV1, operationV3])
})

it('rejects approval evidence when type, scope, revision, digest, cost, expiry, or revocation differs', async () => {
  await expect(requireCrmSearchApproval(requiredApproval, tx)).rejects.toThrow('crm_search_approval_mismatch')
})

it('rejects a forced namespace digest collision with a different source tuple', async () => {
  await allocateCrmSearchNamespace(firstTuple, tx)
  await expect(allocateCrmSearchNamespace(collidingTuple, tx)).rejects.toThrow('crm_search_namespace_collision')
})
```

- [ ] **Step 2: Run the red suites**

Run: `pnpm exec vitest run test/crm/searchIndex/policyRepository.test.ts test/crm/searchIndex/sourceRepository.test.ts test/crm/searchIndex/operationRepository.test.ts test/crm/searchIndex/usageRepository.test.ts test/crm/searchIndex/teardownRepository.test.ts test/crm/searchIndex/namespaceRepository.test.ts test/crm/searchIndex/approvalRepository.test.ts test/crm/searchIndex/telemetryRepository.test.ts`

Expected: FAIL because persistence adapters do not exist.

- [ ] **Step 3: Implement fail-closed repository contracts**

Global/provider admission transactions lock the singleton control row and stamp its revision. Namespace allocation transactionally registers the full server-owned tuple/digest, rejects collisions, applies capacity admission, and prevents reactivation until the prior namespace is provider-confirmed empty. Query and indexing reservations lock both global and client UTC-day rows and enforce calls, dimensions, stored-inventory, and micro-USD caps independently. Every Workers AI call reserves and permanently charges 512 input tokens once sent; retries and late discarded responses charge once each, and release is allowed only when evidence proves no provider call was sent. Upserts require current policy/schema; post-client-delete deletes require the independent teardown snapshot. Approval reads prove exact type/environment/scope/revision/SHA/artifact/binding/evidence/cost/actor/expiry and absence of revocation inside the same transition transaction. Telemetry persists access-controlled high-cardinality identifiers only in structured events and emits bounded daily aggregates. All claim completion uses claim/revision/lease-generation CAS. Missing/malformed state disables provider work, never core CRM writes.

- [ ] **Step 4: Run repository and migration suites**

Run: `pnpm exec vitest run test/crm/searchIndex/*Repository.test.ts test/config/crmSearchMigrationPostgres.test.ts`

Expected: PASS for stale claims, concurrent reservations, control flips, deleted-client teardown, and coalesced successors.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/searchIndex/*Repository.ts server/utils/crm/searchIndex/repository.ts test/crm/searchIndex/*Repository.test.ts
git commit -m "feat(crm-search): add durable search repositories"
```

---

### Task 9: Define and Authenticate the Queue-to-Pages Protocol

**Files:**
- Create: `shared/crmSearchIndexProtocol.ts`
- Create: `shared/crmSearchIndexSigning.ts`
- Create: `server/api/internal/crm-search/process.post.ts`
- Create: `server/api/internal/crm-search/dead-letter.post.ts`
- Create: `server/api/internal/crm-search/health.get.ts`
- Create: `test/crm/searchIndex/protocol.test.ts`
- Create: `test/crm/searchIndex/signing.test.ts`
- Create: `test/server/api/crmSearchProcessEndpoint.test.ts`
- Create: `test/server/api/crmSearchDeadLetterEndpoint.test.ts`
- Create: `test/server/api/crmSearchProtocolHealth.test.ts`

**Interfaces:**
- Consumes: identifier-only messages, WebCrypto HMAC keys, deployed SHAs/digests, and processor/dead-letter dependency injection.
- Produces: protocol v1 message/envelope, canonical signing, freshness verification, typed success outcomes, and health compatibility.

- [ ] **Step 1: Write failing canonical-signing and endpoint tests**

```ts
expect(CRM_SEARCH_INDEX_PROTOCOL_VERSION).toBe(1)
expect(await verifyCrmSearchServiceRequest(validRequest, { k1: secret }, 'k1')).toBe(true)
expect(await verifyCrmSearchServiceRequest({ ...validRequest, operationId: foreignId }, { k1: secret }, 'k1')).toBe(false)
expect(loadOperation).not.toHaveBeenCalledOnInvalidSignature()
expect(await verifyCrmSearchServiceRequest(previousKeyRequest, overlapKeyring, 'k0')).toBe(true)
expect(await verifyCrmSearchServiceRequest(previousKeyRequest, retiredKeyring, 'k0')).toBe(false)
```

- [ ] **Step 2: Run the red tests**

Run: `pnpm exec vitest run test/crm/searchIndex/protocol.test.ts test/crm/searchIndex/signing.test.ts test/server/api/crmSearchProcessEndpoint.test.ts test/server/api/crmSearchDeadLetterEndpoint.test.ts test/server/api/crmSearchProtocolHealth.test.ts`

Expected: FAIL because shared protocol and internal endpoints do not exist.

- [ ] **Step 3: Implement versioned signed envelopes**

```ts
export const CRM_SEARCH_PROCESS_PATH = '/api/internal/crm-search/process' as const
export interface CrmSearchIndexQueueMessage {
  protocolVersion: 1
  operationId: string
  correlationId: string
  enqueuedAt: string
}
export type CrmSearchProcessOutcome =
  | { status: 'complete' }
  | { status: 'accepted_provider_pending' }
  | { status: 'superseded' }
```

Sign method, exact path, timestamp, operation ID, correlation ID, protocol, and body digest using only the active key. Verify canonical byte length and signature with `crypto.subtle.verify` (or an audited timing-safe equivalent), then key version/validity window, bounded freshness, and body digest before any DB lookup. Accept only current/N-1 protocol and active/previous keys during explicit bounded overlap; reject unknown, premature, expired, retired, or malformed-length keys on both process and DLQ paths. Log only identifiers/protocol/status.

- [ ] **Step 4: Run protocol tests**

Run: `pnpm exec vitest run test/crm/searchIndex/protocol.test.ts test/crm/searchIndex/signing.test.ts test/server/api/crmSearchProcessEndpoint.test.ts test/server/api/crmSearchDeadLetterEndpoint.test.ts test/server/api/crmSearchProtocolHealth.test.ts test/config/mcpRequestSigningContract.test.ts`

Expected: PASS with replay-safe idempotency and no shared-secret shortcuts.

- [ ] **Step 5: Deep-review and commit**

```bash
git add shared/crmSearchIndexProtocol.ts shared/crmSearchIndexSigning.ts server/api/internal/crm-search test/crm/searchIndex/protocol.test.ts test/crm/searchIndex/signing.test.ts test/server/api/crmSearchProcessEndpoint.test.ts test/server/api/crmSearchDeadLetterEndpoint.test.ts test/server/api/crmSearchProtocolHealth.test.ts
git commit -m "feat(crm-search): secure queue processing protocol"
```

---

### Task 10: Build the Dedicated Queue Consumer and Binding Contract

**Files:**
- Create: `workers/crm-search-consumer/src/index.ts`
- Create: `workers/crm-search-consumer/src/consumer.ts`
- Create: `workers/crm-search-consumer/src/health.ts`
- Create: `workers/crm-search-consumer/package.json`
- Create: `workers/crm-search-consumer/tsconfig.json`
- Create: `workers/crm-search-consumer/wrangler.toml`
- Create: `workers/crm-search-consumer/scripts/deploy.mjs`
- Create: `workers/crm-search-consumer/DEPLOYMENT.md`
- Create: `test/workers/crmSearchConsumer.test.ts`
- Create: `test/config/crmSearchConsumerConfig.test.ts`
- Create: `test/config/crmSearchBindings.test.ts`
- Modify: `wrangler.toml`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `CrmSearchIndexQueueMessage`, primary queue/DLQ batches, service keyring, and Pages base URL.
- Produces: individual `ack()`/`retry()` behavior, signed primary/dead-letter forwarding, and exact preview/production binding declarations.

- [ ] **Step 1: Write failing Worker/config tests**

```ts
expect(config).toContain('queue = "agency-crm-search-index"')
expect(config).toContain('dead_letter_queue = "agency-crm-search-index-dlq"')
expect(resourceManifest.primaryRetentionSeconds).toBe(1_209_600)
expect(resourceManifest.deadLetterRetentionSeconds).toBe(1_209_600)
expect(successMessage.ack).toHaveBeenCalledOnce()
expect(transientMessage.retry).toHaveBeenCalledWith({ delaySeconds: 30 })
expect(logText).not.toContain('sourceText')
```

- [ ] **Step 2: Run the red suites**

Run: `pnpm exec vitest run test/workers/crmSearchConsumer.test.ts test/config/crmSearchConsumerConfig.test.ts test/config/crmSearchBindings.test.ts`

Expected: FAIL because the Worker and dedicated bindings do not exist.

- [ ] **Step 3: Implement the standalone consumer**

Configure primary queue batch size 5, timeout 5, retries 5, retry delay 30, concurrency 4, and the DLQ; configure the DLQ consumer separately with retries 3. Provision/read back 1,209,600-second retention for both queues and fail readiness on shorter/unknown retention or an unsupported plan. `complete`, `accepted_provider_pending`, and `superseded` acknowledge; transient transport/pre-accept retries; malformed/incompatible messages flow to DLQ; DLQ acknowledges only after durable signed recording. Pages health advertises current/N-1 accepted protocol plus SHA; Worker health advertises emitted protocol plus SHA, and rollout/rollback order is contract-tested.

- [ ] **Step 4: Run Worker type/config tests**

Run: `pnpm exec vitest run test/workers/crmSearchConsumer.test.ts test/config/crmSearchConsumerConfig.test.ts test/config/crmSearchBindings.test.ts && pnpm --dir workers/crm-search-consumer run typecheck`

Expected: PASS; shared bindings remain unchanged and CRM bindings point only at dedicated names.

- [ ] **Step 5: Deep-review and commit**

```bash
git add workers/crm-search-consumer wrangler.toml package.json .env.example test/workers/crmSearchConsumer.test.ts test/config/crmSearchConsumerConfig.test.ts test/config/crmSearchBindings.test.ts
git commit -m "feat(crm-search): add dedicated queue consumer"
```

---

### Task 11: Publish Coalesced Index Operations

**Files:**
- Create: `server/utils/crm/searchIndex/bindings.ts`
- Create: `server/utils/crm/searchIndex/publisher.ts`
- Create: `server/api/cron/crm-search-index-repair.post.ts`
- Create: `test/crm/searchIndex/publisher.test.ts`
- Create: `test/server/api/crmSearchIndexRepair.test.ts`
- Modify: `workers/pages-cron/src/index.ts`

**Interfaces:**
- Consumes: fresh control/policy or teardown state, coalesced dirty rows, operation repositories, `CRM_SEARCH_INDEX_QUEUE`, and cron auth.
- Produces: `expandCrmSearchDirtySources` and `publishCrmSearchOperations` with bounded result counts.

- [ ] **Step 1: Write failing publisher tests**

```ts
expect(await publishCrmSearchOperations(event, { limit: 25 })).toEqual({
  dirtyClaimed: 1, operationsCreated: 1, operationsPublished: 1,
  operationsRescheduled: 0, skippedByControl: 0
})
expect(queue.send).toHaveBeenCalledWith(expect.objectContaining({ operationId, protocolVersion: 1 }))
```

Also assert halted/off leaves dirty rows unexpanded, delete-only expands only deletes, queue failure reschedules via CAS, and repeated repair cannot multiply operations.

- [ ] **Step 2: Run the red tests**

Run: `pnpm exec vitest run test/crm/searchIndex/publisher.test.ts test/server/api/crmSearchIndexRepair.test.ts`

Expected: FAIL because publisher and repair endpoint do not exist.

- [ ] **Step 3: Implement bounded expansion/publication**

Use `FOR UPDATE SKIP LOCKED`, claim IDs, explicit limits, global/policy row locks before expansion, one replaceable pre-admission intent, and publish-confirm CAS. Queue absence/failure never runs provider work inline.

- [ ] **Step 4: Run publisher/cron regressions**

Run: `pnpm exec vitest run test/crm/searchIndex/publisher.test.ts test/server/api/crmSearchIndexRepair.test.ts test/config/crmSearchCaptureMigration.test.ts test/config/platformJobObservabilityContract.test.ts`

Expected: PASS with bounded disabled-mode storage and identifier-only messages.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/searchIndex/bindings.ts server/utils/crm/searchIndex/publisher.ts server/api/cron/crm-search-index-repair.post.ts workers/pages-cron/src/index.ts test/crm/searchIndex/publisher.test.ts test/server/api/crmSearchIndexRepair.test.ts
git commit -m "feat(crm-search): publish coalesced index operations"
```

---

### Task 12: Process, Confirm, Reconcile, Backfill, and Tear Down Vectors

**Files:**
- Create: `server/utils/crm/searchIndex/provider.ts`
- Create: `server/utils/crm/searchIndex/processor.ts`
- Create: `server/utils/crm/searchIndex/confirmation.ts`
- Create: `server/utils/crm/searchIndex/reconciliation.ts`
- Create: `server/utils/crm/searchIndex/backfill.ts`
- Create: `server/utils/crm/searchIndex/teardown.ts`
- Create: `server/utils/crm/searchIndex/deadLetters.ts`
- Create: `server/api/cron/crm-search-reconcile.post.ts`
- Create: `test/crm/searchIndex/provider.test.ts`
- Create: `test/crm/searchIndex/processor.test.ts`
- Create: `test/crm/searchIndex/reconciliation.test.ts`
- Create: `test/crm/searchIndex/backfill.test.ts`
- Create: `test/crm/searchIndex/teardown.test.ts`
- Create: `test/crm/searchIndex/deadLetters.test.ts`
- Create: `test/server/api/crmSearchReconcile.test.ts`
- Modify: `workers/pages-cron/src/index.ts`

**Interfaces:**
- Consumes: strict provider bindings, operations/ledger/budgets, schema roles, source rows, confirmation keys, and teardown snapshots.
- Produces: `processCrmSearchOperation`, `reconcileCrmSearchIndex`, `scheduleCrmSearchBackfill`, `requestCrmSearchClientTeardown`, and confirmed ledger state.

- [ ] **Step 1: Write failing provider lifecycle tests**

```ts
expect(await processCrmSearchOperation(operationId, runtime, options)).toEqual({ status: 'accepted_provider_pending' })
expect(markIndexed).not.toHaveBeenCalled()
expect(await confirmStoredVector(stored, expected)).toBe(true)
expect(stored.namespace).toBe(expected.namespace)
```

Cover reordered upsert/delete completion, stale revision, schema retirement, budget exhaustion, client move, missing/deleted row conversion, malformed embedding, wrong namespace/tag/key version, provider timeout, dead-letter exhaustion, and post-client-delete teardown.
Inject ambiguous database commit outcomes after Workers AI and after Vectorize acceptance, then replay the queue message; assert no blind provider replay, conservative charge retention, exact-tag/absence reconciliation, and eventual durable convergence. Assert a transport retry cannot resubmit an already accepted provider mutation and each dead-letter origin permits only its own audited actions.

- [ ] **Step 2: Run the red lifecycle tests**

Run: `pnpm exec vitest run test/crm/searchIndex/provider.test.ts test/crm/searchIndex/processor.test.ts test/crm/searchIndex/reconciliation.test.ts test/crm/searchIndex/backfill.test.ts test/crm/searchIndex/teardown.test.ts test/crm/searchIndex/deadLetters.test.ts test/server/api/crmSearchReconcile.test.ts`

Expected: FAIL because provider lifecycle modules do not exist.

- [ ] **Step 3: Implement strict asynchronous lifecycle**

```ts
export interface CrmSearchProviderRuntime {
  ai: { run(model: '@cf/baai/bge-base-en-v1.5', input: { text: string[]; pooling: 'cls' }): Promise<{ data?: Array<number[] | Float32Array> }> }
  vectorize: {
    upsert(vectors: CrmSearchVector[]): Promise<{ mutationId: string }>
    deleteByIds(ids: string[]): Promise<{ mutationId: string }>
    getByIds(ids: string[]): Promise<CrmSearchStoredVector[]>
  }
  confirmationSecrets: Readonly<Record<string, string>>
  activeConfirmationKeyVersion: string
}
```

Admission order is claim/lease → fresh control/policy-or-teardown/schema/source → supersession → document/no-op → capacity/readiness/budget → AI → upsert/delete → durable `provider_pending`; deletes never call Workers AI. Before each external call, commit a unique provider-attempt identity plus reservation using `transactionWithoutRetry`; never put an external call inside a retryable transaction callback. An ambiguous finalization reloads by attempt ID, keeps the conservative charge, and reconciles exact keyed tag/absence before any resubmission. Before the first CRM upsert, require both exact metadata indexes plus a confirmed filtered non-CRM sentinel round-trip and absence confirmation. Processors take the client-scoped shared advisory lock from schema read through provider mutation issuance; schema promotion takes its exclusive counterpart, verifies candidate high-watermarks/current revisions, atomically swaps roles, and suppresses retiring-schema upserts. Source deletion fans out across active, candidate, and retiring schemas; a new candidate cannot start while a prior retiring schema remains. Re-read/stamp global control immediately before every Workers AI/Vectorize call. Reconciliation alone confirms exact ID/namespace/schema/revision/key/tag or absence; it discards values and owns resubmission/dead-letter state.

- [ ] **Step 4: Run lifecycle and migration regressions**

Run: `pnpm exec vitest run test/crm/searchIndex test/server/api/crmSearchReconcile.test.ts test/config/crmSearchMigrationPostgres.test.ts`

Expected: PASS with no older upsert resurrection and teardown completion only after provider absence.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/searchIndex server/api/cron/crm-search-reconcile.post.ts workers/pages-cron/src/index.ts test/crm/searchIndex test/server/api/crmSearchReconcile.test.ts
git commit -m "feat(crm-search): add confirmed indexing lifecycle"
```

---

### Task 13: Add Authorized Semantic Retrieval and Deterministic Fusion

**Files:**
- Create: `server/utils/crm/semanticCandidates.ts`
- Create: `server/utils/crm/semanticJoinBack.ts`
- Create: `server/utils/crm/retrieval.ts`
- Create: `server/utils/crm/shadowSearch.ts`
- Create: `test/crm/semanticCandidates.test.ts`
- Create: `test/crm/semanticJoinBack.test.ts`
- Create: `test/crm/retrieval.test.ts`
- Create: `test/crm/shadowSearch.test.ts`
- Modify: `server/utils/asyncBackground.ts`
- Modify: `server/api/crm/search.post.ts`
- Modify: `test/server/api/crmSearchEndpoints.test.ts`

**Interfaces:**
- Consumes: `CrmSearchContext`, normalized request, fresh control/policy, active schema, keyword results, Workers AI, untrusted Vectorize matches, confirmed ledger rows, and current CRM rows.
- Produces: keyword-only, shadow, or agency-AI assist results with explicit fallback reasons and privacy-safe comparison events.

- [ ] **Step 1: Write failing candidate, join-back, and fusion tests**

```ts
expect(filterSemanticMatches([
  { id: 'strong', score: 0.82 },
  { id: 'weak', score: 0.74 }
], { minimumScore: 0.75 })).toEqual([{ id: 'strong', score: 0.82 }])

expect(reciprocalRankFusion({
  keyword: [{ key: 'company:a' }],
  semantic: [{ key: 'company:b' }],
  k: 60,
  keywordWeight: 1,
  semanticWeight: 0.7
})[0]?.key).toBe('company:a')
```

Cover no-result abstention, malformed/duplicate/non-finite candidates, wrong client/organisation/schema/namespace/vector ID, `provider_pending`, tombstoned/deleted/stale/foreign/inaccessible rows, owner visibility, restrictive mode, identifier-like keyword-only, and primary-keyword versus semantic-branch database failures.
Assert entity-key deduplication occurs before final limiting, duplicate appearances retain the best one-based rank once per source list, absent ranks sort last, the complete authorized pools fuse before final limiting, and ties break deterministically by keyword rank, semantic rank, entity type, then entity ID.

- [ ] **Step 2: Run the red retrieval suites**

Run: `pnpm exec vitest run test/crm/semanticCandidates.test.ts test/crm/semanticJoinBack.test.ts test/crm/retrieval.test.ts test/crm/shadowSearch.test.ts`

Expected: FAIL because retrieval modules do not exist.

- [ ] **Step 3: Implement the fail-closed retrieval boundary**

```ts
export interface CrmRetrievalResult {
  results: CrmSearchResult[]
  mode: 'keyword' | 'shadow' | 'assist'
  fallbackReason?: 'disabled' | 'privacy' | 'budget' | 'timeout' | 'provider' | 'semantic_db'
}

export async function retrieveCrm(
  context: CrmSearchContext,
  request: NormalizedCrmSearchRequest,
  deps: CrmRetrievalDependencies
): Promise<CrmRetrievalResult>
```

Run keyword retrieval first. Re-read global control/effective policy immediately before Workers AI and again immediately before Vectorize. Query exactly `topK: 30` in the policy's canonical active-schema namespace with exact `schemaVersion` and allowed-`entityType` metadata filters, requesting neither values nor metadata; drop scores below `0.75`, then resolve only ledger rows matching active schema, canonical namespace/vector ID, `confirmation_state = 'indexed'`, and `tombstone = false`. Reload and revalidate current actor/session/client/permission/owner authority plus current Postgres records before RRF. Propagate the server-generated correlation ID through structured events, reservations, operations, queue/internal HTTP, Workers AI, and Vectorize evidence while keeping it out of metric labels. A primary keyword DB failure fails the request; any semantic-side timeout/provider/ledger/join-back failure releases or settles its reservation and returns keyword. Continue timed-out settlement through `runBackgroundTask` without retaining raw query text. The agency POST endpoint invokes the coordinator so shadow may run while returning the original keyword ordering; the portal endpoint never invokes semantic retrieval. Shadow samples at most 10% of otherwise eligible `agency_global` requests, captures bindings before response, and runs through `waitUntil` without delaying or changing the visible keyword result.

- [ ] **Step 4: Run retrieval and privacy regressions**

Run: `pnpm exec vitest run test/crm/semanticCandidates.test.ts test/crm/semanticJoinBack.test.ts test/crm/retrieval.test.ts test/crm/shadowSearch.test.ts test/crm/searchRequest.test.ts test/crm/searchIndex/policy.test.ts test/crm/searchIndex/usage.test.ts`

Expected: PASS with no semantic-only result below the versioned threshold and no provider call after a kill-switch flip.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/semanticCandidates.ts server/utils/crm/semanticJoinBack.ts server/utils/crm/retrieval.ts server/utils/crm/shadowSearch.ts server/utils/asyncBackground.ts server/api/crm/search.post.ts test/crm/semanticCandidates.test.ts test/crm/semanticJoinBack.test.ts test/crm/retrieval.test.ts test/crm/shadowSearch.test.ts test/server/api/crmSearchEndpoints.test.ts
git commit -m "feat(crm-search): authorize semantic retrieval"
```

---

### Task 14: Integrate Agency AI Assist Without Internal HTTP or Caller-Owned Scope

**Files:**
- Modify: `server/utils/ai/tools/searchCrm.ts`
- Create: `test/ai/tools/searchCrmAuthorization.test.ts`
- Create: `test/ai/tools/searchCrmAssist.test.ts`
- Modify: `test/ai/tools/searchCrm.test.ts`

**Interfaces:**
- Consumes: authenticated tool context, bounded client selector/name, fresh assistant assignment, agency AI surface policy, and Task 13 retrieval.
- Produces: a directly authorized CRM tool result with no internal HTTP hop and no raw query/tool-result leakage.

- [ ] **Step 1: Write failing AI-tool authorization tests**

```ts
await expect(searchCrm({ clientName: 'A', query: 'renewal', limit: 20 }, unauthorizedContext, deps))
  .resolves.toEqual({ ok: false, error: 'No matching client.' })
expect(deps.retrieveCrm).not.toHaveBeenCalled()

expect(deps.resolveContext).toHaveBeenCalledWith(authorizedContext, expect.objectContaining({
  clientSelector: 'A',
  surface: 'agency_ai'
}))
```

Assert ambiguous selectors fail, `clientName` and query are bounded after normalization, client ID/name cannot cross organisation scope, assist is agency-AI-only, all provider failures return keyword, and serialized tool output contains only authorized Postgres fields.

- [ ] **Step 2: Run the red AI-tool suites**

Run: `pnpm exec vitest run test/ai/tools/searchCrm.test.ts test/ai/tools/searchCrmAuthorization.test.ts test/ai/tools/searchCrmAssist.test.ts`

Expected: FAIL because the keyword-only tool does not yet call the assist retrieval coordinator.

- [ ] **Step 3: Upgrade the direct keyword tool to the retrieval coordinator**

```ts
const resolution = await deps.resolveContext(toolContext, {
  clientSelector: normalizedClientSelector,
  surface: 'agency_ai'
})
if (resolution.status !== 'resolved') return fail('No matching client.')
const retrieval = await retrieveCrm(resolution.context, normalizeCrmSearchRequest(input), deps.retrieval)
return toSafeCrmToolResult(resolution.clientName, retrieval)
```

Resolve zero or one active accessible client; reject multiple matching names instead of choosing the first. Do not alter the shared `defaultResolveClient` contract used by unrelated tools, and do not accept an organisation/client/permission claim from the model or tool input.

- [ ] **Step 4: Run AI and retrieval regressions**

Run: `pnpm exec vitest run test/ai/tools/searchCrm*.test.ts test/crm/retrieval.test.ts test/server/utils/crm/searchContext.test.ts`

Expected: PASS with direct dependency injection and server-owned scope.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/ai/tools/searchCrm.ts test/ai/tools/searchCrm.test.ts test/ai/tools/searchCrmAuthorization.test.ts test/ai/tools/searchCrmAssist.test.ts
git commit -m "feat(crm-search): secure agency AI assist"
```

---

### Task 15: Add Evaluation, Retention, and Promotion Governance

**Files:**
- Create: `server/utils/crm/search/evaluation/contracts.ts`
- Create: `server/utils/crm/search/evaluation/fixtures.ts`
- Create: `server/utils/crm/search/evaluation/metrics.ts`
- Create: `server/utils/crm/search/evaluation/gates.ts`
- Create: `server/utils/crm/search/evaluation/runner.ts`
- Create: `server/utils/crm/search/evaluation/repository.ts`
- Create: `server/utils/crm/search/evaluation/sealedArtifact.ts`
- Create: `server/utils/crm/search/retention.ts`
- Create: `server/api/admin/crm-search/evaluations/index.post.ts`
- Create: `server/api/admin/crm-search/evaluations/[id].get.ts`
- Create: `server/api/cron/crm-search-retention.post.ts`
- Create: `test/fixtures/crm-search-evaluation.schema.json`
- Create: `test/fixtures/crm-search-evaluation.sample.json`
- Create: `test/fixtures/crm-search-evaluation/corpus.json`
- Create: `test/fixtures/crm-search-evaluation/development.json`
- Create: `test/fixtures/crm-search-evaluation/holdout.manifest.json`
- Create: `test/fixtures/crm-search-evaluation/preregistration.json`
- Create: `test/fixtures/crm-search-evaluation/adjudication.manifest.json`
- Create: `test/crm/search/evaluation/fixtures.test.ts`
- Create: `test/crm/search/evaluation/metrics.test.ts`
- Create: `test/crm/search/evaluation/gates.test.ts`
- Create: `test/crm/search/evaluation/runner.test.ts`
- Create: `test/crm/search/retention.test.ts`
- Create: `test/server/api/crmSearchEvaluationEndpoints.test.ts`
- Modify: `workers/pages-cron/src/index.ts`

**Interfaces:**
- Consumes: versioned redacted fixtures, keyword/shadow outcomes, schema/ranking versions, approval identities, aggregate telemetry, and retention policy.
- Produces: reproducible metrics/evidence, immutable gate decisions, expiry/deletion counts, and no automatic rollout promotion.

- [ ] **Step 1: Write failing metric and governance tests**

```ts
expect(computeSearchMetrics(cases)).toMatchObject({
  precisionAt5: expect.any(Number),
  recallAt10: expect.any(Number),
  mrr: expect.any(Number),
  ndcgAt10: expect.any(Number),
  bootstrapConfidenceIntervals: expect.any(Object),
  noResultFalsePositiveRate: expect.any(Number)
})
expect(evaluatePromotionGates(regressedNoResultSet).passed).toBe(false)
expect(applyRetention(expiredRows, policy)).not.toContainEqual(expect.objectContaining({ rawQuery: expect.anything() }))
```

Assert fixture schema rejects PII/raw source text, runs pin dataset/schema/model/tokenizer/ranking/threshold versions, two distinct approvals are required for candidate promotion, and no evaluation can mutate a client policy. Enforce the approved evaluation constitution: at least 180 checked-in development queries across three clients, sealed 360-query holdout with checked-in SHA/stratum manifest, required strata/minima, preregistered candidate selection, two independent non-implementer reviewers, and adjudication provenance. Promotion also requires zero authorization leaks, concurrent budget safety, proven capacity headroom, and seven consecutive days of shadow evidence with at least 200 unbiased eligible samples for each of three separately approved clients.

- [ ] **Step 2: Run the red evaluation suites**

Run: `pnpm exec vitest run test/crm/search/evaluation test/crm/search/retention.test.ts test/server/api/crmSearchEvaluationEndpoints.test.ts`

Expected: FAIL because the evaluation and retention modules do not exist.

- [ ] **Step 3: Implement reproducible evidence and bounded retention**

```ts
export interface CrmSearchEvaluationEvidence {
  datasetDigest: string
  schemaVersion: string
  modelVersion: string
  tokenizerVersion: string
  rankingVersion: string
  thresholdVersion: string
  metrics: CrmSearchEvaluationMetrics
  decidedAt: string
}
```

ADMIN endpoints use `requireRole(event, ['ADMIN'])`, validate bodies with Zod, write audit rows transactionally, and cannot change rollout state. The governed runner unseals holdout labels only after preregistration is frozen, recomputes query-level metrics, nDCG, bootstrap confidence intervals, latency/load, cost, concurrency-budget, capacity, authorization-leak, and shadow-evidence gates server-side, and rejects caller-submitted pass flags or aggregate-only evidence. Evaluation approvals expire after 14 days and enforce runner/implementer/fixture-author/judge/approver separation plus independent revocation. Retention uses the approved defaults: detailed events 30 days, aggregates 180 days, usage/rate cards 400 days, confirmed operations 90 days, resolved dead letters 180 days, confirmed tombstone/teardown ledgers 90 days, and evaluation/policy/security evidence two years. A narrowly granted `SECURITY DEFINER` function performs legal-hold-aware, high-watermark-checked expiry and writes chained deletion attestations before bounded removal; ordinary roles cannot update/delete/truncate governed evidence. The job alerts after 24 hours without a successful purge, aggregates before expiry, and destroys retired HMAC keys only after their last referenced event expires. Client erasure targets 15 minutes, warns at one hour, pages at four hours, and opens a privacy incident at 24 hours. Purge recovery enters delete-only, rotates relevant keys, confirms provider erasure, and never reports success from a database tombstone alone.

- [ ] **Step 4: Run evaluation, privacy, and cron regressions**

Run: `pnpm exec vitest run test/crm/search/evaluation test/crm/search/retention.test.ts test/server/api/crmSearchEvaluationEndpoints.test.ts test/crm/searchIndex/telemetry.test.ts test/config/platformJobObservabilityContract.test.ts`

Expected: PASS with deterministic metrics and zero raw-query persistence.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/search/evaluation server/utils/crm/search/retention.ts server/api/admin/crm-search/evaluations server/api/cron/crm-search-retention.post.ts workers/pages-cron/src/index.ts test/fixtures/crm-search-evaluation.schema.json test/fixtures/crm-search-evaluation.sample.json test/fixtures/crm-search-evaluation test/crm/search/evaluation test/crm/search/retention.test.ts test/server/api/crmSearchEvaluationEndpoints.test.ts
git commit -m "feat(crm-search): add evaluation governance"
```

---

### Task 16: Build Audited Operations APIs and the Admin Control Surface

**Files:**
- Create: `server/utils/crm/search/operations/contracts.ts`
- Create: `server/utils/crm/search/operations/health.ts`
- Create: `server/utils/crm/search/operations/commands.ts`
- Create: `server/utils/crm/search/operations/audit.ts`
- Create: `server/api/admin/crm-search/health.get.ts`
- Create: `server/api/admin/crm-search/policies/index.get.ts`
- Create: `server/api/admin/crm-search/policies/[clientId].put.ts`
- Create: `server/api/admin/crm-search/global-control.put.ts`
- Create: `server/api/admin/crm-search/backfills.post.ts`
- Create: `server/api/admin/crm-search/reconcile.post.ts`
- Create: `server/api/admin/crm-search/dead-letters/index.get.ts`
- Create: `server/api/admin/crm-search/dead-letters/[id].post.ts`
- Create: `server/api/admin/crm-search/approvals/index.post.ts`
- Create: `server/api/admin/crm-search/approvals/index.get.ts`
- Create: `server/api/admin/crm-search/approvals/import.post.ts`
- Create: `server/api/admin/crm-search/approvals/[id]/revoke.post.ts`
- Create: `server/api/admin/crm-search/telemetry.get.ts`
- Create: `app/types/crmSearchOperations.ts`
- Create: `app/pages/admin/ai/crm-search.vue`
- Create: `app/components/ai/crm-search/SearchHealthSummary.vue`
- Create: `app/components/ai/crm-search/ClientPolicyTable.vue`
- Create: `app/components/ai/crm-search/PolicyTransitionDialog.vue`
- Create: `app/components/ai/crm-search/GlobalControlDialog.vue`
- Create: `app/components/ai/crm-search/DeadLetterTable.vue`
- Create: `app/components/ai/crm-search/DeadLetterResolutionDialog.vue`
- Create: `app/components/ai/crm-search/EvaluationEvidencePanel.vue`
- Create: `app/components/ai/crm-search/ApprovalLedger.vue`
- Create: `app/components/ai/crm-search/ApprovalCreateDialog.vue`
- Create: `app/components/ai/crm-search/ApprovalImportDialog.vue`
- Create: `app/components/ai/crm-search/ApprovalRevokeDialog.vue`
- Create: `app/components/ai/crm-search/SearchTelemetryPanel.vue`
- Modify: `app/layouts/agency.vue`
- Create: `test/crm/search/operations/health.test.ts`
- Create: `test/crm/search/operations/commands.test.ts`
- Create: `test/server/api/crmSearchAdminEndpoints.test.ts`
- Create: `test/components/ai/crmSearchOperations.test.ts`

**Interfaces:**
- Consumes: ADMIN identity, expected state revision, explicit reason/ticket, policy state machine, health aggregates, DLQ records, and evaluation evidence.
- Produces: bounded health/telemetry/approval read models and audited compare-and-swap commands; it never calls Workers AI, Vectorize, or Queue directly.

- [ ] **Step 1: Read the mandatory frontend-design skill, then write failing API/component tests**

Run before editing Vue files: `sed -n '1,240p' ~/.Codex/plugins/marketplaces/Codex-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`

```ts
await expect(changeGlobalControl({
  expectedRevision: 4,
  nextState: 'enabled',
  reason: 'INC-42 approved'
}, nonAdmin, deps)).rejects.toMatchObject({ statusCode: 403 })
expect(deps.audit.insert).not.toHaveBeenCalled()
```

Component tests assert every field is wrapped in `UFormField`, all controls are Nuxt UI v4 components, stale revisions surface a refresh action, destructive transitions require typed confirmation plus reason, and zero-value budgets are shown as disabled rather than unlimited.
For each of `resource_provision`, `production_migration`, `production_deploy`, `client_indexing`, `client_shadow`, and `client_assist`, assert the UI renders only its required global/client scope, expected revision, SHA/artifact/binding/evidence digests, cost ceiling, expiry, reason, and actor-separation fields; import preserves original timestamp/hash and revoke appends a separate immutable record.

- [ ] **Step 2: Run the red operations suites**

Run: `pnpm exec vitest run test/crm/search/operations test/server/api/crmSearchAdminEndpoints.test.ts test/components/ai/crmSearchOperations.test.ts`

Expected: FAIL because operations services, endpoints, and components do not exist.

- [ ] **Step 3: Implement bounded state-machine commands and UI**

```ts
export interface CrmSearchAdminCommand {
  expectedRevision: number
  reason: string
  ticket?: string
}

export interface CrmSearchHealthView {
  global: { state: CrmSearchGlobalState; revision: number }
  counts: { dirty: number; pending: number; providerPending: number; deadLetters: number }
  oldestAgeSeconds: { dirty: number | null; operation: number | null }
  schema: Array<{ version: string; role: CrmSearchSchemaRole; confirmedVectors: number }>
  dependency: Array<{ name: 'neon' | 'workers_ai' | 'vectorize' | 'queue'; status: 'ok' | 'degraded' | 'down' }>
  freshness: { staleClients: number; p95RevisionLagSeconds: number | null }
  cost: { globalBudgetUsedBasisPoints: number; clientsNearBudget: number }
  fallbacks: Readonly<Record<string, number>>
}
```

Every mutating endpoint uses `requireRole(event, ['ADMIN'])`, Zod, expected-revision CAS, transactionally paired append-only audit, legal transition validation, capacity/readiness checks, and the exact unexpired/unrevoked approval evidence required by that transition. Approval create/import/list/revoke validates distinct actors, immutable scope/revision/SHA/digests/cost/reason/expiry, and append-only revocation. Backfill/reconcile/DLQ commands enqueue durable identifiers; they do no provider work inline. Health/telemetry expose dependency degradation, client index currency, retry/DLQ growth, cross-scope candidate rejection, fallback/latency, and budget proximity through bounded aggregates only. Keep the UI default-safe, responsive, dark-mode compatible, and explicit about production approvals.

- [ ] **Step 4: Run operations, accessibility, and type regressions**

Run: `pnpm exec vitest run test/crm/search/operations test/server/api/crmSearchAdminEndpoints.test.ts test/components/ai/crmSearchOperations.test.ts && pnpm exec nuxt typecheck 2>&1 | tee /tmp/crm-search-typecheck-task16.log`

Expected: focused tests PASS; no new error rooted in the new CRM search files versus the frozen base comparison.

- [ ] **Step 5: Deep-review and commit**

```bash
git add server/utils/crm/search/operations server/api/admin/crm-search app/types/crmSearchOperations.ts app/pages/admin/ai/crm-search.vue app/components/ai/crm-search app/layouts/agency.vue test/crm/search/operations test/server/api/crmSearchAdminEndpoints.test.ts test/components/ai/crmSearchOperations.test.ts
git commit -m "feat(crm-search): add audited operations console"
```

---

### Task 17: Make Public CRM Search Claims Truthful and Testable

**Files:**
- Create: `app/utils/marketingClaimManifest.ts`
- Create: `test/public/crmSearchMarketingClaims.test.ts`
- Create: `test/public/crmSearchMarketingRendered.test.ts`
- Create: `scripts/crm-search/marketing-smoke.mjs`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue`
- Modify: `app/pages/platform/ai.vue`
- Modify: `app/pages/resources/ai-automation.vue`
- Modify: `app/pages/resources/integrations.vue`
- Modify: `app/pages/resources/index.vue`
- Modify: `app/pages/landing.vue`
- Modify: `app/pages/ai-training.vue`
- Modify: `app/pages/index.vue`
- Modify: `app/pages/creativity.vue`
- Modify: `app/pages/privacy.vue`
- Modify: `app/_drafts/pricing-self-service.vue`

**Interfaces:**
- Consumes: approved capability truth (`keyword visible`, `agency AI assist controlled`, `portal semantic unavailable`, `off by default`, `freshness after confirmed indexing`).
- Produces: a centralized claim manifest, source assertions, rendered assertions, and synchronized public copy.

- [ ] **Step 1: Write failing source and rendered claim tests**

```ts
expect(CRM_SEARCH_MARKETING_CLAIMS).toMatchObject({
  visibleRanking: 'keyword',
  semanticSurface: 'agency_ai_assist',
  defaultMode: 'off',
  portalSemanticRanking: false
})
expect(renderedText).not.toMatch(/all records (are|stay) continuously indexed/i)
```

The source test inventories every public CRM/vector/search/privacy claim and fails when a new occurrence is not mapped to a capability key. The rendered test checks every changed route and SEO field, including feature detail/index, navigation, landing, resource pages, and privacy disclosure in light and dark modes.

- [ ] **Step 2: Run the red marketing tests**

Run: `pnpm exec vitest run test/public/crmSearchMarketingClaims.test.ts test/public/crmSearchMarketingRendered.test.ts`

Expected: FAIL on the existing automatic-indexing and broad Vectorize claims.

- [ ] **Step 3: Synchronize copy with the shipped control boundary**

Use the manifest in the feature catalog/detail/nav where practical; phrase the capability as controlled CRM hybrid search for agency-assistant retrieval, off by default and available only after authorized indexing/evaluation. Do not imply semantic ranking in portal/global visible search or instant/continuous indexing. Qualify the privacy disclosure so Workers AI/Vectorize processing is gated and off by default, and align its retention, erasure, subprocessor, and no-training language with the approved contract.

- [ ] **Step 4: Run public tests and browser smoke**

Run: `pnpm exec vitest run test/public/crmSearchMarketingClaims.test.ts test/public/crmSearchMarketingRendered.test.ts && node scripts/crm-search/marketing-smoke.mjs`

Expected: PASS with no console errors, clipped controls, unreadable dark-mode colors, or stale marketing claim.

- [ ] **Step 5: Deep-review and commit**

```bash
git add app/utils/marketingClaimManifest.ts app/pages/features/index.vue 'app/pages/features/[slug].vue' app/components/MarketingNav.vue app/pages/platform/ai.vue app/pages/resources/ai-automation.vue app/pages/resources/integrations.vue app/pages/resources/index.vue app/pages/landing.vue app/pages/ai-training.vue app/pages/index.vue app/pages/creativity.vue app/pages/privacy.vue app/_drafts/pricing-self-service.vue scripts/crm-search/marketing-smoke.mjs test/public/crmSearchMarketingClaims.test.ts test/public/crmSearchMarketingRendered.test.ts
git commit -m "docs(marketing): qualify CRM hybrid search claims"
```

---

### Task 18: Add Preview Isolation, Frozen Artifacts, and Operational Runbooks

**Files:**
- Create: `scripts/crm-search/resource-manifest.ts`
- Create: `scripts/crm-search/preview-binding-inventory.ts`
- Create: `scripts/crm-search/preview-binding-guard.mjs`
- Create: `scripts/crm-search/build-artifact.mjs`
- Create: `scripts/crm-search/verify-artifact.mjs`
- Create: `scripts/crm-search/deploy-pages-artifact.mjs`
- Create: `scripts/crm-search/deploy-consumer-artifact.mjs`
- Create: `scripts/crm-search/e2e-preview.mjs`
- Create: `scripts/crm-search/e2e-cleanup.mjs`
- Create: `scripts/crm-search/neon-lifecycle.mjs`
- Create: `scripts/crm-search/bootstrap-resource-approval.mjs`
- Create: `scripts/crm-search/evidence-bundle.mjs`
- Create: `test/config/crmSearchPreviewBindingGuard.test.ts`
- Create: `test/config/crmSearchFrozenArtifact.test.ts`
- Create: `test/config/crmSearchRunbookContract.test.ts`
- Create: `test/config/crmSearchNeonLifecycle.test.ts`
- Modify: `test/config/pagesDeployGuard.test.ts`
- Create: `docs/runbooks/crm-search-indexing.md`
- Create: `docs/runbooks/crm-search-operations.md`
- Create: `docs/runbooks/crm-search-evaluation.md`
- Create: `docs/runbooks/crm-search-preview-e2e.md`
- Create: `docs/runbooks/crm-search-staged-rollout.md`
- Modify: `scripts/deploy-pages.mjs`
- Modify: `workers/crm-search-consumer/scripts/deploy.mjs`
- Modify: `package.json`
- Modify: `.nvmrc`
- Modify: `.dev.vars.example`
- Modify: `.env.example`
- Modify: `ENV_SETUP_GUIDE.md`
- Modify: `docs/ENVIRONMENT_VARIABLES.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `wrangler.toml`

**Interfaces:**
- Consumes: explicit environment manifest, exact Node `24.18.0`, clean Git tree, content digest, full Pages/Worker binding inventories, and separate approval evidence.
- Produces: fail-closed preview isolation, immutable artifact manifests, deterministic deploy wrappers, evidence bundles, and exact operator runbooks.

- [ ] **Step 1: Write failing configuration and artifact tests**

```ts
expect(assertPreviewIsolation(inventory)).toEqual({ ok: true })
expect(inventory.mutableBindings).toEqual(expect.arrayContaining([
  'CACHE', 'CRM_SEARCH_INDEX_QUEUE', 'R2', 'AI', 'VECTORIZE',
  'SITE_INTELLIGENCE_VECTORIZE', 'CRM_SEARCH_VECTORIZE', 'BROWSER', 'HYPERDRIVE'
]))
expect(() => verifyArtifact({ expectedDigest, actualDigest: 'different' })).toThrow('artifact_digest_mismatch')
expect(readBack.primaryQueue.retentionSeconds).toBe(1_209_600)
expect(readBack.deadLetterQueue.retentionSeconds).toBe(1_209_600)
expect(verifyBootstrapResourceApproval(bootstrapArtifact)).toMatchObject({ type: 'resource_provision', originalTimestamp: expect.any(String) })
expect(runbookThresholds).toEqual({ warnPercent: 60, pagePercent: 80, blockPercent: 90 })
```

Inventory all queues, R2 buckets, KV/D1, AI, every Vectorize binding, Browser, Hyperdrive/direct database endpoints, services, Durable Objects, vars, secrets, stateful integrations, and Pages project/branch. Assert preview names cannot equal production names and require the exact preview Vectorize `agency-crm-search-preview`, queue `agency-crm-search-index-preview`, DLQ `agency-crm-search-index-preview-dlq`, and Worker `agency-crm-search-consumer-preview`. Assert all deploy wrappers reject a dirty tree, unverified artifact, wrong target, missing approval record, or Node version drift.

- [ ] **Step 2: Run the red release-safety suites**

Run: `pnpm exec vitest run test/config/crmSearchPreviewBindingGuard.test.ts test/config/crmSearchFrozenArtifact.test.ts test/config/crmSearchRunbookContract.test.ts test/config/crmSearchNeonLifecycle.test.ts test/config/pagesDeployGuard.test.ts`

Expected: FAIL because the complete preview inventory and frozen-artifact wrappers do not exist and Pages currently permits dirty deploy input.

- [ ] **Step 3: Implement fail-closed release tooling and documentation**

Build once from a clean detached checkout at the committed SHA, record SHA/Node/lockfile/build/tool/config digests, verify before each Pages/Worker deployment, and remove `--commit-dirty=true`. Replace the live `deploy:production` package entry and main-branch CI path so neither can rebuild nor call Wrangler directly: both consume only the verified frozen artifact wrapper, require the protected manual production environment plus exact `production_deploy` approval, and fail on any digest/target drift. The Neon lifecycle script creates the exact TTL-bound schema-only branch, proves empty scoped source tables, and always deletes it in `finally`. Define the six independent production approval types in their guarded order: resource provisioning, production database migration, dormant code deployment, per-client indexing/backfill, per-client shadow processing, and per-client assist. Before approval tables exist, the resource-provision approval is a signed immutable CI/release artifact with its original timestamp/hash; after migration the guarded importer preserves and verifies that provenance rather than reissuing authority. Every approval expires, is revocable, and binds actor/reason, exact SHA/artifact/binding manifest, environment, evidence, client set, and maximum cost where applicable. The operations runbook makes keyword error rate and queue age alertable, keeps ordinary self-healing retries dashboard-only, and warns at 60%, pages at 80%, and blocks new indexing at 90% of dirty/operation capacity. The staged rollout runbook orders metadata indexes and sentinel readiness before backfill and requires reconciliation/evaluation evidence before promotion. Commands default to preview and require an explicit production flag plus matching evidence.

- [ ] **Step 4: Run focused release-guard tests without deploying**

Run: `pnpm exec vitest run test/config/crmSearchPreviewBindingGuard.test.ts test/config/crmSearchFrozenArtifact.test.ts test/config/crmSearchRunbookContract.test.ts test/config/crmSearchNeonLifecycle.test.ts test/config/pagesDeployGuard.test.ts`

Expected: PASS; no Cloudflare or Neon mutation occurs in this task.

- [ ] **Step 5: Deep-review and commit**

```bash
git add scripts/crm-search workers/crm-search-consumer/scripts/deploy.mjs docs/runbooks/crm-search-indexing.md docs/runbooks/crm-search-operations.md docs/runbooks/crm-search-evaluation.md docs/runbooks/crm-search-preview-e2e.md docs/runbooks/crm-search-staged-rollout.md scripts/deploy-pages.mjs package.json .nvmrc .dev.vars.example .env.example ENV_SETUP_GUIDE.md docs/ENVIRONMENT_VARIABLES.md README.md .github/workflows/ci.yml wrangler.toml test/config/crmSearchPreviewBindingGuard.test.ts test/config/crmSearchFrozenArtifact.test.ts test/config/crmSearchRunbookContract.test.ts test/config/crmSearchNeonLifecycle.test.ts test/config/pagesDeployGuard.test.ts
git commit -m "chore(crm-search): guard preview and release operations"
```

- [ ] **Step 6: Verify the committed tooling from a clean detached checkout**

Run: `pnpm crm-search:artifact:verify -- --dry-run && pnpm deploy:check && pnpm --dir workers/crm-search-consumer run typecheck && pnpm --dir workers/crm-search-consumer run wrangler:types && pnpm --dir workers/crm-search-consumer run bundle:dry-run`

Expected: PASS against the committed SHA with clean-tree, exact-target, generated-types, config, and dry-run bundle evidence; no deployment occurs.

---

### Task 19: Battle-Test the Complete Slice and Produce Readiness Evidence

**Files:**
- Create: `test/e2e/crmSearchPostgresProvider.test.ts`
- Create: `test/e2e/crmSearchAuthorization.test.ts`
- Create: `docs/reports/crm-search-implementation-review.md`
- Create: `docs/reports/crm-search-preview-evidence.json`
- Modify: `docs/superpowers/plans/2026-08-09-enterprise-crm-hybrid-search.md`

**Interfaces:**
- Consumes: the complete committed implementation, guarded schema-only Neon branch, isolated preview Queue/DLQ/Vectorize/Pages resources, deterministic fixtures, and frozen base diagnostics.
- Produces: verified migrations, provider lifecycle evidence, authorization evidence, test/build/type comparisons, adversarial review disposition, and a production-readiness report with production still halted.

- [x] **Step 1: Write the end-to-end tests before provisioning isolated resources**

```ts
it('indexes, confirms, retrieves, reauthorizes, deletes, and confirms absence', async () => {
  await fixture.insertCompany({ revision: 1 })
  await pipeline.drain()
  await expect(provider.getByIds([fixture.vectorId])).resolves.toHaveLength(1)
  await expect(searchAs(fixture.allowedActor, 'renewal')).resolves.toContainAuthorizedCompany()
  await fixture.softDeleteCompany()
  await pipeline.drainAndReconcile()
  await expect(provider.getByIds([fixture.vectorId])).resolves.toHaveLength(0)
})
```

Cover staff owner visibility, portal active session/client, cross-tenant indistinguishability, off/shadow/assist, threshold abstention, timeout fallback settlement, control flips, backfill/promotion isolation, client move, teardown, replay, DLQ, and privacy-safe evidence. Through the real endpoints, prove portal search stays keyword-only with zero Workers AI/Vectorize calls, agency-global shadow may call providers but preserves visible keyword order, and only agency-AI assist returns authorized fused results.

- [x] **Step 2: Deep-review and commit the E2E harness before building artifacts**

Run: `pnpm exec vitest run test/e2e/crmSearchPostgresProvider.test.ts test/e2e/crmSearchAuthorization.test.ts`

Expected: tests are runnable and skip only behind explicit verified external-resource guards.

```bash
git add test/e2e/crmSearchPostgresProvider.test.ts test/e2e/crmSearchAuthorization.test.ts
git commit -m "test(crm-search): add isolated end-to-end harness"
```

- [x] **Step 3: Run focused, full, type, build, and repository gates on the candidate implementation SHA**

Run: `pnpm exec vitest run test/crm test/server/api/crmSearch*.test.ts test/workers/crmSearchConsumer.test.ts test/config/crmSearch*.test.ts test/public/crmSearch*.test.ts test/e2e/crmSearch*.test.ts`

Run: `pnpm test`

Run: `pnpm exec nuxt typecheck 2>&1 | tee /tmp/crm-search-typecheck-final.log`

Run: `pnpm build`

Run: `pnpm deploy:check && pnpm --dir workers/crm-search-consumer run typecheck && pnpm --dir workers/crm-search-consumer run wrangler:types && pnpm --dir workers/crm-search-consumer run bundle:dry-run && git diff --check`

Expected: focused/full tests, build, target guard, generated types, worker config/bundle dry-run, and whitespace gate PASS. Compare typecheck/full-suite diagnostics to a same-machine reproduction at base SHA and record only net-new errors; any new CRM-search diagnostic blocks completion. Re-read every changed file, check aliases, SSRF, secrets, selector sentinels, reactivity, duplicate UI, dark mode, queue/index names, default-off state, and raw-query/source-text leakage. Complete a requirement-by-requirement audit against the coverage matrix and record command SHA/digests.

- [x] **Step 4: Run fresh adversarial reviews and resolve every HIGH/MEDIUM finding**

Use independent authorization, indexing/provider, and operations/release reviewers. Each reviews the live diff and evidence against the approved design. Resolve findings in atomic commits and repeat Step 3 plus review until no HIGH/MEDIUM finding remains. Record the finding, evidence, disposition, corrective commit, and re-run command in `docs/reports/crm-search-implementation-review.md`.

- [x] **Step 5: Preflight the guarded Neon lifecycle without retaining external state**

Run: `pnpm crm-search:migrate:test -- --expected-project "$CRM_SEARCH_TEST_NEON_PROJECT_ID" --schema-only --dry-run`

Expected: the guard proves target identity, explicit TTL/schema-only capability, branch name, zero-row check plan, migrations 350–352, fixture plan, and cleanup handler without creating a branch or applying SQL. If any proof is unavailable, it exits before mutation.

- [ ] **Step 6: Provision only isolated preview resources and run final-SHA provider E2E**

Run: `pnpm crm-search:e2e:preview`

Expected: the script owns one outer `try/finally`. It proves a clean final implementation SHA and complete binding guard; creates a clean detached checkout; builds Pages and Worker exactly once; signs and verifies the final-SHA artifact manifest; then creates `crm-search-e2e-<sha>` with TTL/schema-only mode, proves empty source tables, applies 350–352, seeds only synthetic fixtures, and creates/reconciles only the exact preview resources. It polls both metadata indexes, proves the filtered sentinel lifecycle before CRM upsert, deploys exactly the signed frozen bytes, separately exercises portal keyword-only, agency-global shadow, and agency-AI assist plus every other real runtime transition, runs the frozen development/holdout evaluation through the real provider, and records recomputed gates. Finally it purges preview namespaces/messages/secrets, confirms the index empty or deletes it, deletes the isolated Neon branch, and proves every mutable preview target returned to baseline. It never targets production identifiers. A finding requiring any code/config/dependency change invalidates the artifact/evidence and loops back through Steps 3–6.

- [ ] **Step 7: Finalize evidence and commit the verified handoff**

```bash
git add docs/reports/crm-search-implementation-review.md docs/reports/crm-search-preview-evidence.json docs/superpowers/plans/2026-08-09-enterprise-crm-hybrid-search.md
git commit -m "test(crm-search): verify enterprise readiness"
```

The handoff must say that implementation and isolated preview verification are complete while production schema/resources/code/indexing/shadow/assist remain unapproved and unchanged.

#### Task 19 historical local-readiness evidence — 2026-08-11

The evidence below applies only to historical candidate `efd177a7d12d95190b37c8a301d1166d8022858d`. A later release-safety correction pass supersedes its final-readiness conclusion. The correction tree based on `ee653429570239eaa783f941a0f11a3d0ec0417f` has a real guarded preview execution/cleanup path behind exact flags, verified authorization bindings, injected adapters, production denylisting, an outer `finally`, exact mutation journalling, and baseline readback. Its bounded affected slice passed 59 tests with one opt-in local-Postgres skip; its nine-file release slice passed 56 tests with one guarded external-database skip. No external adapter has been run: preview execution, resource provisioning, provider calls, Neon lifecycle, deploys, cleanup readback, and sealed-holdout ceremony all remain pending. The corrected bytes still require a new clean build, signed frozen artifact, and independent final review.

- Candidate `efd177a7d12d95190b37c8a301d1166d8022858d`; same-machine comparison base `f46d1e7793ba558e374c380e47d610a65d42756a`.
- Steps 1–2 completed in atomic harness commit `f45fa96f86c1feb9fbb5f819ca024813d887a5a6`. The final 12-file compatibility slice passed 87/87 tests.
- The final full suite completed with 1,651 files and 10,762 tests passing; its four failing files were Chromium sandbox, localhost-listen sandbox, or missing shared-checkout artifact failures. No plausible CRM-search regression remained.
- Typecheck reproduced the known application baseline and returned no Task 19 or `crm/search*` diagnostic. It is not recorded as green.
- Commit `efd177a7` replaced the obsolete raw-only size threshold with immutable 250,000-byte margins below the current Workers Paid 64,000,000-byte raw and 10,000,000-byte gzip limits. A clean Node 24.18.0 build completed in 253 seconds: client/server, 162 prerenders, Nitro, wrapping, and the dual size guard passed at 25,578,485 / 63,750,000 raw bytes and 6,570,472 / 9,750,000 conservative gzip bytes. BigInt/`es2019` messages remain recorded as verified build warnings.
- At that historical candidate, all then-known HIGH/MEDIUM review findings were corrected in committed code (`a3e9dbfd`, `f7888767`, `00c59e60`, `9e6b392b`, `68b0e2fc`, `17764238`, `efd177a7`). This statement does not constitute final review of the current corrected bytes.
- The guarded Neon schema-only TTL preflight and Task 18 artifact/resource/E2E/cleanup plans were dry-run only and reported zero mutations.
- Step 6 was not performed: no external preview resource was provisioned or contacted, no signed resource/readiness evidence was supplied, and the sealed holdout remains `productionReady: false`.
- Step 7 remains incomplete because isolated preview verification is not complete. Production schema, resources, code, indexing, shadow, and assist remain unapproved, halted, and unchanged.

---

## Spec Coverage Matrix

| Approved contract | Plan tasks |
|---|---|
| Fresh server-owned organisation/client/actor/owner authorization and uniform 404 | 1–4, 14, 19 |
| POST-only normalized privacy-safe query handling and portal view semantics | 1, 4, 13, 19 |
| Durable expand/validate/activate migrations and source revisions | 5–6, 19 |
| Dedicated queue, worker, Vectorize, signed identifier-only protocol | 7–12, 18–19 |
| Confirmed versioned indexing, budgets, teardown, repair, DLQ | 5–12, 16, 19 |
| Active-schema authorized semantic join-back, abstention, RRF, fallback | 13–14, 19 |
| Off/shadow/assist controls, evaluation, retention, promotion evidence | 7–8, 13, 15–16, 19 |
| Operations UI, audit, truthful public claims | 16–17 |
| Preview isolation, frozen artifacts, separate production approvals | 18–19 |
