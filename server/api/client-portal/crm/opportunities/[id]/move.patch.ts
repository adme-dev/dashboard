// server/api/client-portal/crm/opportunities/[id]/move.patch.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({ stage_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const stage = await queryOne<{ id: string, probability: number, is_won: boolean, is_lost: boolean }>(
    `SELECT id, probability, is_won, is_lost FROM crm_stages WHERE id = $1 AND (client_id IS NULL OR client_id = $2)`,
    [b.stage_id, client.clientId],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open'
  const closeSet = (stage.is_won || stage.is_lost) ? ', actual_close_date = CURRENT_DATE' : ''
  const row = await queryOne(
    `UPDATE crm_opportunities
        SET stage_id = $1, status = $2, probability = $3, stage_changed_at = NOW(), updated_at = NOW(),
            stage_history = stage_history || jsonb_build_object('stage_id', $1::text, 'at', NOW()::text, 'by', $4::text)
            ${closeSet}
      WHERE id = $5 AND client_id = $6 AND deleted_at IS NULL
      RETURNING *`,
    [b.stage_id, status, stage.probability, client.id, id, client.clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  return { item: row }
})
