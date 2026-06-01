// server/api/crm/opportunities/[id]/move.patch.ts
// Kanban drop target: move an opportunity to a new stage, recompute status/probability,
// stamp stage_changed_at, append to stage_history, and set close date on won/lost.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { recordStageChange } from '~~/server/utils/crm/stageAutomation'

const Body = z.object({ client_id: z.string().uuid(), stage_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const stage = await queryOne<{ id: string, probability: number, is_won: boolean, is_lost: boolean }>(
    `SELECT id, probability, is_won, is_lost FROM crm_stages WHERE id = $1 AND (client_id IS NULL OR client_id = $2)`,
    [b.stage_id, b.client_id],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  // Capture the prior stage so we can record the transition + fire automations.
  const prev = await queryOne<{ stage_id: string, owner_id: string | null }>(
    `SELECT stage_id, owner_id FROM crm_opportunities WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, b.client_id],
  )
  if (!prev) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open'
  const closeSet = (stage.is_won || stage.is_lost) ? ', actual_close_date = CURRENT_DATE' : ''
  const row = await queryOne<{ owner_id: string | null }>(
    `UPDATE crm_opportunities
        SET stage_id = $1, status = $2, probability = $3, stage_changed_at = NOW(), updated_at = NOW(),
            stage_history = stage_history || jsonb_build_object('stage_id', $1::text, 'at', NOW()::text, 'by', $4::text)
            ${closeSet}
      WHERE id = $5 AND client_id = $6 AND deleted_at IS NULL
      RETURNING *`,
    [b.stage_id, status, stage.probability, user.id, id, b.client_id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  // History + stage-entry automations (best-effort — never fail the move on a hook error).
  if (prev.stage_id !== b.stage_id) {
    try {
      await recordStageChange({
        clientId: b.client_id,
        opportunityId: id as string,
        fromStageId: prev.stage_id,
        toStageId: b.stage_id,
        ownerId: row.owner_id ?? prev.owner_id,
        changedBy: user.id,
      })
    } catch (e) {
      console.error('[crm] stage-change hook failed', e)
    }
  }
  return { item: row }
})
