import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess, isSocialClientId } from '~~/server/utils/social/clientAccess'
import { embedSocialClientKnowledge } from '~~/server/utils/aiEntityEmbedder'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { enqueue } from '~~/server/utils/queue'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  const evidenceId = getRouterParam(event, 'evidenceId') || ''
  await requireSocialClientAccess(event, clientId)
  if (!isSocialClientId(evidenceId)) throw createError({ statusCode: 400, statusMessage: 'Invalid evidenceId' })
  const body = await readBody<{ reviewStatus?: 'approved' | 'rejected' | 'superseded'; summary?: string }>(event)
  if (!body.reviewStatus || !['approved', 'rejected', 'superseded'].includes(body.reviewStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid reviewStatus required' })
  }
  const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 2_000) : null
  const row = await queryOne(
    `UPDATE client_operational_evidence
        SET review_status = $3, summary = COALESCE($4, summary), reviewed_by = $5,
            reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND client_id = $2
      RETURNING id, evidence_type, source_system, title, summary, occurred_at, review_status`,
    [evidenceId, clientId, body.reviewStatus, summary, user.id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Evidence not found' })
  await enqueue(event, 'embed.social.client', { clientId }, () => {
    runAfterResponse(event, embedSocialClientKnowledge(event, clientId), 'social-evidence-review-client-knowledge-index')
    return Promise.resolve()
  })
  return row
})
