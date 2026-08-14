import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { registry } from '~~/server/utils/ai/tools'

/**
 * The CRM has readers and writers outside the obvious REST namespaces. Keep this
 * snapshot reviewable: adding a record-bearing route or service must deliberately
 * update the authority inventory before it can be used by retrieval/indexing work.
 */
const CRM_ROUTE_SURFACES = [
  "route:server/api/client-portal/crm/activities/[id].delete.ts",
  "route:server/api/client-portal/crm/activities/[id].patch.ts",
  "route:server/api/client-portal/crm/activities/index.get.ts",
  "route:server/api/client-portal/crm/activities/index.post.ts",
  "route:server/api/client-portal/crm/audience-cohorts.get.ts",
  "route:server/api/client-portal/crm/audit/index.get.ts",
  "route:server/api/client-portal/crm/bulk.post.ts",
  "route:server/api/client-portal/crm/communications/[id].delete.ts",
  "route:server/api/client-portal/crm/communications/index.get.ts",
  "route:server/api/client-portal/crm/communications/index.post.ts",
  "route:server/api/client-portal/crm/companies/[id].delete.ts",
  "route:server/api/client-portal/crm/companies/[id].patch.ts",
  "route:server/api/client-portal/crm/companies/index.get.ts",
  "route:server/api/client-portal/crm/companies/index.post.ts",
  "route:server/api/client-portal/crm/custom-fields/[id].delete.ts",
  "route:server/api/client-portal/crm/custom-fields/index.get.ts",
  "route:server/api/client-portal/crm/custom-fields/index.post.ts",
  "route:server/api/client-portal/crm/data-sources.get.ts",
  "route:server/api/client-portal/crm/data-sources.post.ts",
  "route:server/api/client-portal/crm/data-sources/[id]/sync.post.ts",
  "route:server/api/client-portal/crm/documents/[id].delete.ts",
  "route:server/api/client-portal/crm/documents/[id]/download.get.ts",
  "route:server/api/client-portal/crm/documents/index.get.ts",
  "route:server/api/client-portal/crm/documents/index.post.ts",
  "route:server/api/client-portal/crm/email-routes/[id].delete.ts",
  "route:server/api/client-portal/crm/email-routes/[id]/rotate.post.ts",
  "route:server/api/client-portal/crm/email-routes/index.get.ts",
  "route:server/api/client-portal/crm/email-routes/index.post.ts",
  "route:server/api/client-portal/crm/export.get.ts",
  "route:server/api/client-portal/crm/line-items/[id].delete.ts",
  "route:server/api/client-portal/crm/line-items/[id].patch.ts",
  "route:server/api/client-portal/crm/line-items/index.get.ts",
  "route:server/api/client-portal/crm/line-items/index.post.ts",
  "route:server/api/client-portal/crm/object-defs/index.get.ts",
  "route:server/api/client-portal/crm/opportunities/[id].delete.ts",
  "route:server/api/client-portal/crm/opportunities/[id].patch.ts",
  "route:server/api/client-portal/crm/opportunities/[id]/move.patch.ts",
  "route:server/api/client-portal/crm/opportunities/index.get.ts",
  "route:server/api/client-portal/crm/opportunities/index.post.ts",
  "route:server/api/client-portal/crm/people/[id].delete.ts",
  "route:server/api/client-portal/crm/people/[id].patch.ts",
  "route:server/api/client-portal/crm/people/import.post.ts",
  "route:server/api/client-portal/crm/people/index.get.ts",
  "route:server/api/client-portal/crm/people/index.post.ts",
  "route:server/api/client-portal/crm/personas.get.ts",
  "route:server/api/client-portal/crm/personas/status.get.ts",
  "route:server/api/client-portal/crm/pipeline.get.ts",
  "route:server/api/client-portal/crm/records/[id].delete.ts",
  "route:server/api/client-portal/crm/records/[id].get.ts",
  "route:server/api/client-portal/crm/records/[id].patch.ts",
  "route:server/api/client-portal/crm/records/[id]/move.patch.ts",
  "route:server/api/client-portal/crm/records/index.get.ts",
  "route:server/api/client-portal/crm/records/index.post.ts",
  "route:server/api/client-portal/crm/relationships/[id].delete.ts",
  "route:server/api/client-portal/crm/relationships/index.get.ts",
  "route:server/api/client-portal/crm/relationships/index.post.ts",
  "route:server/api/client-portal/crm/search.post.ts",
  "route:server/api/client-portal/crm/stages/index.get.ts",
  "route:server/api/client-portal/crm/tasks/[id].delete.ts",
  "route:server/api/client-portal/crm/tasks/[id].patch.ts",
  "route:server/api/client-portal/crm/tasks/index.get.ts",
  "route:server/api/client-portal/crm/tasks/index.post.ts",
  "route:server/api/client-portal/crm/views/[id].delete.ts",
  "route:server/api/client-portal/crm/views/[id].patch.ts",
  "route:server/api/client-portal/crm/views/index.get.ts",
  "route:server/api/client-portal/crm/views/index.post.ts",
  "route:server/api/internal/workflows/crm/followup-review.post.ts",
  "route:server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-candidates.get.ts",
  "route:server/api/office/[officeId]/meetings/[meetingId]/action-items/[actionItemId]/crm-task.post.ts",
  "route:server/api/crm/activities/[id].delete.ts",
  "route:server/api/crm/activities/[id].patch.ts",
  "route:server/api/crm/activities/index.get.ts",
  "route:server/api/crm/activities/index.post.ts",
  "route:server/api/crm/ai/draft-followup.post.ts",
  "route:server/api/crm/ai/next-best-action.get.ts",
  "route:server/api/crm/ai/status.get.ts",
  "route:server/api/crm/analytics/adoption.get.ts",
  "route:server/api/crm/analytics/forecast.get.ts",
  "route:server/api/crm/analytics/funnel.get.ts",
  "route:server/api/crm/analytics/performance.get.ts",
  "route:server/api/crm/analytics/summary.get.ts",
  "route:server/api/crm/assignment-rules/[id].delete.ts",
  "route:server/api/crm/assignment-rules/index.get.ts",
  "route:server/api/crm/assignment-rules/index.post.ts",
  "route:server/api/crm/audit/index.get.ts",
  "route:server/api/crm/bulk.post.ts",
  "route:server/api/crm/communications/[id].delete.ts",
  "route:server/api/crm/communications/index.get.ts",
  "route:server/api/crm/communications/index.post.ts",
  "route:server/api/crm/companies/[id].delete.ts",
  "route:server/api/crm/companies/[id].get.ts",
  "route:server/api/crm/companies/[id].patch.ts",
  "route:server/api/crm/companies/[id]/meeting-actions.get.ts",
  "route:server/api/crm/companies/index.get.ts",
  "route:server/api/crm/companies/index.post.ts",
  "route:server/api/crm/custom-fields/[id].delete.ts",
  "route:server/api/crm/custom-fields/index.get.ts",
  "route:server/api/crm/custom-fields/index.post.ts",
  "route:server/api/crm/data-sources.get.ts",
  "route:server/api/crm/data-sources.post.ts",
  "route:server/api/crm/data-sources/[id]/sync.post.ts",
  "route:server/api/crm/dedupe/merge.post.ts",
  "route:server/api/crm/dedupe/suggestions.get.ts",
  "route:server/api/crm/documents/[id].delete.ts",
  "route:server/api/crm/documents/[id]/download.get.ts",
  "route:server/api/crm/documents/index.get.ts",
  "route:server/api/crm/documents/index.post.ts",
  "route:server/api/crm/email-routes/[id].delete.ts",
  "route:server/api/crm/email-routes/[id]/rotate.post.ts",
  "route:server/api/crm/email-routes/index.get.ts",
  "route:server/api/crm/email-routes/index.post.ts",
  "route:server/api/crm/export.get.ts",
  "route:server/api/crm/health/at-risk.get.ts",
  "route:server/api/crm/health/compute.post.ts",
  "route:server/api/crm/health/index.get.ts",
  "route:server/api/crm/line-items/[id].delete.ts",
  "route:server/api/crm/line-items/[id].patch.ts",
  "route:server/api/crm/line-items/index.get.ts",
  "route:server/api/crm/line-items/index.post.ts",
  "route:server/api/crm/meeting-actions/[actionItemId]/convert.post.ts",
  "route:server/api/crm/object-defs/[id].delete.ts",
  "route:server/api/crm/object-defs/[id].patch.ts",
  "route:server/api/crm/object-defs/[id]/field-defs/[fid].delete.ts",
  "route:server/api/crm/object-defs/[id]/field-defs/[fid].patch.ts",
  "route:server/api/crm/object-defs/[id]/field-defs/index.get.ts",
  "route:server/api/crm/object-defs/[id]/field-defs/index.post.ts",
  "route:server/api/crm/object-defs/index.get.ts",
  "route:server/api/crm/object-defs/index.post.ts",
  "route:server/api/crm/opportunities/[id].delete.ts",
  "route:server/api/crm/opportunities/[id].get.ts",
  "route:server/api/crm/opportunities/[id].patch.ts",
  "route:server/api/crm/opportunities/[id]/create-quote.post.ts",
  "route:server/api/crm/opportunities/[id]/move.patch.ts",
  "route:server/api/crm/opportunities/index.get.ts",
  "route:server/api/crm/opportunities/index.post.ts",
  "route:server/api/crm/people/[id].delete.ts",
  "route:server/api/crm/people/[id].get.ts",
  "route:server/api/crm/people/[id].patch.ts",
  "route:server/api/crm/people/[id]/meeting-actions.get.ts",
  "route:server/api/crm/people/import.post.ts",
  "route:server/api/crm/people/index.get.ts",
  "route:server/api/crm/people/index.post.ts",
  "route:server/api/crm/pipeline.get.ts",
  "route:server/api/crm/quotes.get.ts",
  "route:server/api/crm/records/[id].delete.ts",
  "route:server/api/crm/records/[id].get.ts",
  "route:server/api/crm/records/[id].patch.ts",
  "route:server/api/crm/records/[id]/move.patch.ts",
  "route:server/api/crm/records/index.get.ts",
  "route:server/api/crm/records/index.post.ts",
  "route:server/api/crm/relationships/[id].delete.ts",
  "route:server/api/crm/relationships/index.get.ts",
  "route:server/api/crm/relationships/index.post.ts",
  "route:server/api/crm/scoring/compute.post.ts",
  "route:server/api/crm/scoring/index.get.ts",
  "route:server/api/crm/search.post.ts",
  "route:server/api/crm/settings/index.get.ts",
  "route:server/api/crm/settings/index.put.ts",
  "route:server/api/crm/stage-automations/[id].delete.ts",
  "route:server/api/crm/stage-automations/[id].patch.ts",
  "route:server/api/crm/stage-automations/index.get.ts",
  "route:server/api/crm/stage-automations/index.post.ts",
  "route:server/api/crm/stages/index.get.ts",
  "route:server/api/crm/targets/[id].delete.ts",
  "route:server/api/crm/targets/index.get.ts",
  "route:server/api/crm/targets/index.post.ts",
  "route:server/api/crm/targets/leaderboard.get.ts",
  "route:server/api/crm/tasks/[id].delete.ts",
  "route:server/api/crm/tasks/[id].patch.ts",
  "route:server/api/crm/tasks/index.get.ts",
  "route:server/api/crm/tasks/index.post.ts",
  "route:server/api/crm/verticals/assign.post.ts",
  "route:server/api/crm/verticals/index.get.ts",
  "route:server/api/crm/views/[id].delete.ts",
  "route:server/api/crm/views/[id].patch.ts",
  "route:server/api/crm/views/index.get.ts",
  "route:server/api/crm/views/index.post.ts",
] as const

const CRM_SERVICE_SURFACES = [
  "service:server/api/cron/crm-dormancy.post.ts",
  "service:server/api/cron/crm-health-recompute.post.ts",
  "service:server/api/cron/crm-meeting-actions.post.ts",
  "service:server/api/cron/crm-score-decay.post.ts",
  "service:server/api/cron/crm-search-index-repair.post.ts",
  "service:server/api/cron/crm-search-reconcile.post.ts",
  'service:server/api/cron/crm-search-retention.post.ts',
  "service:server/api/cron/crm-task-reminders.post.ts",
  "service:server/utils/ai/executors/crmActions.ts",
  "service:server/utils/crm/activation.ts",
  "service:server/utils/crm/adoption.ts",
  "service:server/utils/crm/aiConfig.ts",
  "service:server/utils/crm/aiDraft.ts",
  "service:server/utils/crm/aiSignals.ts",
  "service:server/utils/crm/analytics.ts",
  "service:server/utils/crm/assignment.ts",
  "service:server/utils/crm/audit.ts",
  "service:server/utils/crm/bulk.ts",
  "service:server/utils/crm/catalogFeed.ts",
  'service:server/utils/crm/catalogSourceGodMode.ts',
  "service:server/utils/crm/catalogSourceService.ts",
  "service:server/utils/crm/clientCatalogAccess.ts",
  "service:server/utils/crm/clientCrmAccess.ts",
  "service:server/utils/crm/comms.ts",
  "service:server/utils/crm/commsDb.ts",
  "service:server/utils/crm/csv.ts",
  "service:server/utils/crm/customFields.ts",
  "service:server/utils/crm/dedupe.ts",
  "service:server/utils/crm/documents.ts",
  "service:server/utils/crm/documentsDb.ts",
  "service:server/utils/crm/emailCommunicationProjection.ts",
  "service:server/utils/crm/emailContracts.ts",
  "service:server/utils/crm/emailInboundConfig.ts",
  "service:server/utils/crm/emailInboundProcessingContracts.ts",
  "service:server/utils/crm/emailInboundProcessor.ts",
  "service:server/utils/crm/emailInboundQueue.ts",
  "service:server/utils/crm/emailOutboundPolicy.ts",
  "service:server/utils/crm/emailReplyToken.ts",
  "service:server/utils/crm/emailRepository.ts",
  "service:server/utils/crm/emailRouteManagement.ts",
  "service:server/utils/crm/emailRouteRepository.ts",
  "service:server/utils/crm/engine/recordFilter.ts",
  "service:server/utils/crm/engine/recordWrite.ts",
  "service:server/utils/crm/engine/resolveObjects.ts",
  "service:server/utils/crm/engine/schemas.ts",
  "service:server/utils/crm/engine/seedVertical.ts",
  "service:server/utils/crm/engine/types.ts",
  "service:server/utils/crm/engine/validateRecord.ts",
  "service:server/utils/crm/exportRecords.ts",
  "service:server/utils/crm/filters.ts",
  "service:server/utils/crm/healthScoring.ts",
  "service:server/utils/crm/healthSignals.ts",
  "service:server/utils/crm/lifecycle.ts",
  "service:server/utils/crm/lineItems.ts",
  "service:server/utils/crm/lineItemsDb.ts",
  "service:server/utils/crm/meetingBridge.ts",
  "service:server/utils/crm/nextBestAction.ts",
  "service:server/utils/crm/oppQuote.ts",
  "service:server/utils/crm/opportunityStageTransition.ts",
  "service:server/utils/crm/platformRolloutReadiness.ts",
  "service:server/utils/crm/queryScope.ts",
  "service:server/utils/crm/ranking.ts",
  "service:server/utils/crm/recordAccess.ts",
  "service:server/utils/crm/relationships.ts",
  "service:server/utils/crm/relationshipsDb.ts",
  "service:server/utils/crm/retrieval.ts",
  "service:server/utils/crm/scoreSignals.ts",
  "service:server/utils/crm/scoring.ts",
  "service:server/utils/crm/search.ts",
  'service:server/utils/crm/search/evaluation/contracts.ts',
  'service:server/utils/crm/search/evaluation/fixtures.ts',
  'service:server/utils/crm/search/evaluation/gates.ts',
  'service:server/utils/crm/search/evaluation/metrics.ts',
  'service:server/utils/crm/search/evaluation/repository.ts',
  'service:server/utils/crm/search/evaluation/runner.ts',
  'service:server/utils/crm/search/evaluation/sealedArtifact.ts',
  'service:server/utils/crm/search/operations/audit.ts',
  'service:server/utils/crm/search/operations/bootstrapApproval.ts',
  'service:server/utils/crm/search/operations/commands.ts',
  'service:server/utils/crm/search/operations/contracts.ts',
  'service:server/utils/crm/search/operations/execution.ts',
  'service:server/utils/crm/search/operations/health.ts',
  'service:server/utils/crm/search/retention.ts',
  "service:server/utils/crm/searchIndex/analyticsKeyring.ts",
  "service:server/utils/crm/searchIndex/approvalRepository.ts",
  "service:server/utils/crm/searchIndex/backfill.ts",
  "service:server/utils/crm/searchIndex/bindings.ts",
  "service:server/utils/crm/searchIndex/confirmation.ts",
  "service:server/utils/crm/searchIndex/contracts.ts",
  "service:server/utils/crm/searchIndex/deadLetters.ts",
  "service:server/utils/crm/searchIndex/dirtyExpansionRepository.ts",
  "service:server/utils/crm/searchIndex/documentRepository.ts",
  "service:server/utils/crm/searchIndex/documents.ts",
  "service:server/utils/crm/searchIndex/identity.ts",
  "service:server/utils/crm/searchIndex/namespaceRepository.ts",
  "service:server/utils/crm/searchIndex/operationRepository.ts",
  "service:server/utils/crm/searchIndex/policy.ts",
  "service:server/utils/crm/searchIndex/policyRepository.ts",
  "service:server/utils/crm/searchIndex/processor.ts",
  "service:server/utils/crm/searchIndex/provider.ts",
  "service:server/utils/crm/searchIndex/publicationRepository.ts",
  "service:server/utils/crm/searchIndex/publisher.ts",
  "service:server/utils/crm/searchIndex/reconciliation.ts",
  "service:server/utils/crm/searchIndex/repository.ts",
  "service:server/utils/crm/searchIndex/sourceRepository.ts",
  "service:server/utils/crm/searchIndex/teardown.ts",
  "service:server/utils/crm/searchIndex/teardownRepository.ts",
  "service:server/utils/crm/searchIndex/telemetry.ts",
  "service:server/utils/crm/searchIndex/telemetryRepository.ts",
  "service:server/utils/crm/searchIndex/usage.ts",
  "service:server/utils/crm/searchIndex/usageRepository.ts",
  "service:server/utils/crm/searchRequest.ts",
  "service:server/utils/crm/semanticCandidates.ts",
  "service:server/utils/crm/semanticJoinBack.ts",
  "service:server/utils/crm/shadowSearch.ts",
  "service:server/utils/crm/stageAutomation.ts",
  "service:server/utils/crm/stages.ts",
  "service:server/utils/crm/targetsDb.ts",
  "service:server/utils/crm/tasks.ts",
  "service:server/utils/crm/transactionalEmail.ts",
  "service:server/utils/crm/trustedCandidateAccess.ts",
  "service:server/utils/crm/types.ts",
  "service:server/utils/crm/viewsDb.ts",
  "service:server/utils/leads/crmAccessPolicy.ts",
  "service:server/utils/leads/crmBridge.ts",
  "service:server/utils/leads/crmPromotion.ts",
  "service:server/utils/leads/crmPromotionState.ts",
  "service:server/utils/leads/dispatch.ts",
  "service:workers/crm-cron/src/index.ts",
  "service:workers/email-worker/src/crmAdapter.ts",
] as const

// This is the reviewed snapshot. Runtime registry discovery is deliberately
// separate so a newly registered tool cannot redefine the baseline it must be
// compared against.
const CRM_TOOL_SURFACES = [
  "tool:draft_followup",
  "tool:get_crm_pipeline",
  "tool:log_crm_activity",
  "tool:propose_opportunity",
  "tool:propose_quote",
  "tool:search_crm",
] as const

export const CRM_RECORD_ACCESS_SURFACE_INVENTORY = Object.freeze([
  ...CRM_ROUTE_SURFACES,
  ...CRM_TOOL_SURFACES,
  ...CRM_SERVICE_SURFACES
].sort())

function walkTypes(root: string, dir: string, found: string[]) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTypes(root, path, found)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      found.push(`route:${relative(root, path)}`)
    }
  }
}

/**
 * Performs a filesystem classification rather than a source-text assertion, so
 * route additions/removals surface as a real inventory drift failure in CI.
 */
export function scanCrmRecordSurfaces(
  root = process.cwd(),
  tools: readonly RegisteredTool[] = registry
): string[] {
  const found: string[] = []
  walkTypes(root, join(root, 'server/api/crm'), found)
  walkTypes(root, join(root, 'server/api/client-portal/crm'), found)
  found.push(...discoverCrmExternalRouteSurfaces(root))
  found.push(...discoverRegisteredCrmToolSurfaces(tools))
  found.push(...discoverCrmIndirectServiceSurfaces(root))
  return found.sort()
}

/**
 * CRM record access also occurs in two route families outside the public CRM
 * namespaces. Every internal CRM workflow is record-bearing; office action-item
 * routes are included only when their endpoint name starts with `crm-`, so
 * unrelated meeting and action-item routes do not enter this inventory.
 */
export function discoverCrmExternalRouteSurfaces(root = process.cwd()): string[] {
  const found: string[] = []
  walkServiceTypes(root, join(root, 'server/api/internal/workflows/crm'), () => true, found)
  walkServiceTypes(root, join(root, 'server/api/office'), path =>
    /^server\/api\/office\/[^/]+\/meetings\/[^/]+\/action-items\/[^/]+\/crm-[^/]+\.(?:get|post|put|patch|delete)\.ts$/i.test(path), found)
  return found.map(surface => surface.replace(/^service:/, 'route:')).sort()
}

export type RegisteredTool = { name: string; description: string }

/**
 * CRM is an explicit runtime concern in tool metadata. Reading the assembled
 * registry catches a newly registered CRM tool even when no inventory line was
 * manually added for it.
 */
export function discoverRegisteredCrmToolSurfaces(
  tools: readonly RegisteredTool[] = registry
): string[] {
  return tools
    .filter(tool => /crm/i.test(`${tool.name} ${tool.description}`))
    .map(tool => `tool:${tool.name}`)
    .sort()
}

function walkServiceTypes(root: string, directory: string, matches: (relativePath: string) => boolean, found: string[]) {
  if (!existsSync(directory)) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      walkServiceTypes(root, path, matches, found)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const relativePath = relative(root, path)
      if (matches(relativePath)) found.push(`service:${relativePath}`)
    }
  }
}

/**
 * The maintained indirect-service manifest is intentionally narrow and
 * filesystem-backed. New CRM modules in these record-bearing roots are returned
 * as unclassified drift until their authority inventory entry is reviewed.
 */
export function discoverCrmIndirectServiceSurfaces(root = process.cwd()): string[] {
  const found: string[] = []
  walkServiceTypes(root, join(root, 'server/utils/crm'), path =>
    !path.endsWith('/recordAccessInventory.ts') && !path.endsWith('/searchContext.ts'), found)
  walkServiceTypes(root, join(root, 'server/utils/leads'), path =>
    /\/crm[^/]*\.ts$/i.test(path) || path.endsWith('/dispatch.ts'), found)
  walkServiceTypes(root, join(root, 'server/utils/ai/executors'), path =>
    path.endsWith('/crmActions.ts'), found)
  walkServiceTypes(root, join(root, 'server/api/cron'), path =>
    /\/crm-[^/]*\.ts$/i.test(path), found)
  walkServiceTypes(root, join(root, 'workers/crm-cron/src'), path =>
    path === 'workers/crm-cron/src/index.ts', found)
  walkServiceTypes(root, join(root, 'workers/email-worker/src'), path =>
    path === 'workers/email-worker/src/crmAdapter.ts', found)
  return found.sort()
}

export function discoverCrmInventoryDrift(
  discovered: readonly string[],
  inventory: readonly string[] = CRM_RECORD_ACCESS_SURFACE_INVENTORY
): { unclassified: string[]; missing: string[] } {
  const discoveredSet = new Set(discovered)
  const inventorySet = new Set(inventory)
  return {
    unclassified: [...discoveredSet].filter(surface => !inventorySet.has(surface)).sort(),
    missing: [...inventorySet].filter(surface => !discoveredSet.has(surface)).sort()
  }
}
