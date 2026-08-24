import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess, isSocialClientId } from '~~/server/utils/social/clientAccess'
import { normalizeClientEvidenceInput } from '~~/server/utils/socialNewsGovernance'
import { embedSocialClientKnowledge } from '~~/server/utils/aiEntityEmbedder'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { enqueue } from '~~/server/utils/queue'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  await requireSocialClientAccess(event, clientId)
  const input = normalizeClientEvidenceInput(await readBody<Record<string, unknown>>(event))
  if (!input.title || !input.content) throw createError({ statusCode: 400, statusMessage: 'Evidence title and content required' })
  if (input.projectId && !isSocialClientId(input.projectId)) throw createError({ statusCode: 400, statusMessage: 'Invalid projectId' })
  if (input.briefId && !isSocialClientId(input.briefId)) throw createError({ statusCode: 400, statusMessage: 'Invalid briefId' })
  if (input.projectId) {
    const project = await queryOne('SELECT id FROM projects WHERE id = $1 AND client_id = $2', [input.projectId, clientId])
    if (!project) throw createError({ statusCode: 400, statusMessage: 'Project does not belong to this client' })
  }
  if (input.briefId) {
    const brief = await queryOne('SELECT id FROM briefs WHERE id = $1 AND client_id = $2', [input.briefId, clientId])
    if (!brief) throw createError({ statusCode: 400, statusMessage: 'Brief does not belong to this client' })
  }
  const row = await queryOne(
    `INSERT INTO client_operational_evidence
       (client_id, project_id, brief_id, evidence_type, source_system, source_id, source_url,
        title, content, summary, occurred_at, review_status, created_by, reviewed_by, reviewed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
             CASE WHEN $12 = 'approved' THEN $13 ELSE NULL END,
             CASE WHEN $12 = 'approved' THEN NOW() ELSE NULL END)
     ON CONFLICT (client_id, source_system, source_id) WHERE source_id IS NOT NULL
     DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, summary = EXCLUDED.summary,
                   source_url = EXCLUDED.source_url, occurred_at = EXCLUDED.occurred_at,
                   review_status = 'pending', reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
     RETURNING id, evidence_type, source_system, title, summary, occurred_at, review_status, created_at`,
    [clientId, input.projectId, input.briefId, input.evidenceType, input.sourceSystem,
      input.sourceId, input.sourceUrl, input.title, input.content, input.summary || null,
      input.occurredAt, input.reviewStatus, user.id],
  )
  if (row?.review_status === 'approved') {
    await enqueue(event, 'embed.social.client', { clientId }, () => {
      runAfterResponse(event, embedSocialClientKnowledge(event, clientId), 'social-evidence-client-knowledge-index')
      return Promise.resolve()
    })
  }
  return row
})
