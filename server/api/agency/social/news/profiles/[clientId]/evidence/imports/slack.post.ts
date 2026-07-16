import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { normalizeClientEvidenceInput } from '~~/server/utils/socialNewsGovernance'
import { embedSocialClientKnowledge } from '~~/server/utils/aiEntityEmbedder'

/** POST .../evidence/imports/slack — import an exported Slack discussion for review. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.ADMIN)
  const clientId = getRouterParam(event, 'clientId') || ''
  await requireSocialClientAccess(event, clientId)
  const body = await readBody<{ items?: Array<Record<string, unknown>> }>(event)
  const items = Array.isArray(body?.items) ? body.items.slice(0, 200) : []
  if (!items.length) throw createError({ statusCode: 400, statusMessage: 'items required' })
  let imported = 0
  for (const raw of items) {
    const input = normalizeClientEvidenceInput({ ...raw, sourceSystem: 'slack', reviewStatus: 'pending' })
    if (!input.title || !input.content) continue
    await queryOne(
      `INSERT INTO client_operational_evidence
        (client_id, evidence_type, source_system, source_id, source_url, title, content, summary, occurred_at, review_status, project_id, brief_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (client_id, source_system, source_id) DO NOTHING`,
      [clientId, input.evidenceType, input.sourceSystem, input.sourceId, input.sourceUrl, input.title, input.content, input.summary, input.occurredAt, 'pending', input.projectId, input.briefId, user.id],
    )
    imported++
  }
  await embedSocialClientKnowledge(event, clientId)
  return { ok: true, imported, reviewStatus: 'pending' }
})
