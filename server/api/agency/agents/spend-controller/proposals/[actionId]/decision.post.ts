import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

type ProposalDecision = 'ignored' | 'edited'

function parseDecision(raw: unknown): ProposalDecision {
  if (raw === 'ignored' || raw === 'edited') return raw
  throw createError({ statusCode: 400, statusMessage: 'decision must be ignored or edited' })
}

export default eventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const actionId = getRouterParam(event, 'actionId')
  if (!actionId) {
    throw createError({ statusCode: 400, statusMessage: 'actionId is required' })
  }

  const body = await readBody(event)
  const decision = parseDecision(body?.decision)
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const editedActionId = decision === 'edited' && typeof body?.editedActionId === 'string'
    ? body.editedActionId
    : null

  const row = await queryOne<{ id: string, metadata: Record<string, unknown> }>(
    `UPDATE campaign_action_log
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'proposalDecision', $2::text,
           'proposalDecidedBy', $3::text,
           'proposalDecidedAt', NOW()::text,
           'proposalDecisionNote', $4::text,
           'editedActionId', $5::text
         ))
     WHERE id = $1
       AND metadata->>'source' = 'spend_controller_agent'
       AND action_status = 'planned'
     RETURNING id::text, metadata`,
    [actionId, decision, user.id, note, editedActionId]
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Editable Spend Controller proposal not found' })
  }

  return {
    ok: true,
    actionId: row.id,
    decision,
    metadata: row.metadata || {},
  }
})
