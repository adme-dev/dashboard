import { setHeader } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { recordHrAuditEvent } from '~~/server/utils/hr/audit'
import { buildMondayProcessSuggestions } from '~~/server/utils/hr/mondayProcessSuggestions'
import { loadMondayProcessSummaries } from '~~/server/utils/hr/mondayProcessSuggestionSource'
import { getActiveMondayEvidenceScope } from '~~/server/utils/hr/mondayScope'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const user = await requireHrAdmin(event)
  const scope = await getActiveMondayEvidenceScope()
  if (!scope) return { active: false, candidates: [], limitations: ['An owner-approved Monday evidence scope is required.'] }

  const summaries = await loadMondayProcessSummaries(scope)
  const candidates = summaries.flatMap(buildMondayProcessSuggestions)
  await recordHrAuditEvent({
    actorId: user.id,
    action: 'monday_process_suggestions.viewed',
    targetType: 'monday_evidence_scope',
    targetId: scope.id,
    metadata: { boardCount: summaries.length, candidateCount: candidates.length },
  })
  return {
    active: true,
    scopeId: scope.id,
    candidates,
    limitations: [
      'Suggestions are deterministic drafts from allowlisted structured fields.',
      'Nothing is approved, added to a questionnaire or attributed to an employee automatically.',
    ],
  }
})
