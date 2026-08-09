import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

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
  "route:server/api/client-portal/crm/search.get.ts",
  "route:server/api/client-portal/crm/stages/index.get.ts",
  "route:server/api/client-portal/crm/tasks/[id].delete.ts",
  "route:server/api/client-portal/crm/tasks/[id].patch.ts",
  "route:server/api/client-portal/crm/tasks/index.get.ts",
  "route:server/api/client-portal/crm/tasks/index.post.ts",
  "route:server/api/client-portal/crm/views/[id].delete.ts",
  "route:server/api/client-portal/crm/views/[id].patch.ts",
  "route:server/api/client-portal/crm/views/index.get.ts",
  "route:server/api/client-portal/crm/views/index.post.ts",
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
  "route:server/api/crm/search.get.ts",
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
  'tool:search_crm',
  'tool:get_crm_pipeline',
  'tool:propose_opportunity',
  'tool:log_crm_activity',
  'tool:propose_quote',
  'tool:draft_followup',
  'service:workers/crm-cron/src/index.ts',
  'service:workers/email-worker/src/crmAdapter.ts',
  'service:server/utils/crm/emailInboundProcessor.ts',
  'service:server/utils/crm/emailRouteManagement.ts',
  'service:server/utils/leads/crmBridge.ts',
  'service:server/utils/leads/crmPromotion.ts',
  'service:server/utils/leads/dispatch.ts',
  'service:server/api/cron/crm-dormancy.post.ts',
  'service:server/api/cron/crm-health-recompute.post.ts',
  'service:server/api/cron/crm-meeting-actions.post.ts',
  'service:server/api/cron/crm-score-decay.post.ts',
  'service:server/api/cron/crm-task-reminders.post.ts'
] as const

export const CRM_RECORD_ACCESS_SURFACE_INVENTORY = Object.freeze([
  ...CRM_ROUTE_SURFACES,
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
export function scanCrmRecordSurfaces(root = process.cwd()): string[] {
  const found: string[] = []
  walkTypes(root, join(root, 'server/api/crm'), found)
  walkTypes(root, join(root, 'server/api/client-portal/crm'), found)

  for (const surface of CRM_SERVICE_SURFACES) {
    if (!surface.startsWith('service:')) {
      found.push(surface)
      continue
    }
    const path = surface.slice('service:'.length)
    if (existsSync(join(root, path))) found.push(surface)
  }

  return found.sort()
}
