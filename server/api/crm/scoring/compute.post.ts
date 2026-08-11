// server/api/crm/scoring/compute.post.ts
// Recompute lead scores — one target, or all people/companies for a client.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { recomputeScore } from '~~/server/utils/crm/scoreSignals'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'
import { buildWhere, visibilityCondsForContext } from '~~/server/utils/crm/queryScope'

const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company']),
  target_id: z.string().uuid().optional(),
  all: z.boolean().default(false),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })

  if (b.target_id) {
    await requireCrmRecordAccess(context, { type: b.target_type, id: b.target_id })
    const r = await recomputeScore({
      clientId: context.clientId,
      targetType: b.target_type,
      targetId: b.target_id,
      reason: 'manual',
      context
    })
    return { item: r }
  }
  if (!b.all) throw createError({ statusCode: 400, statusMessage: 'Provide target_id or all=true' })

  const table = b.target_type === 'person' ? 'crm_people' : 'crm_companies'
  const { where, params } = buildWhere(
    context.clientId,
    visibilityCondsForContext(context, b.target_type, table)
  )
  const ids = await queryRows<{ id: string }>(
    `SELECT id FROM ${table} ${where} LIMIT 1000`,
    params,
  )
  let scored = 0
  for (const { id } of ids) {
    const r = await recomputeScore({
      clientId: context.clientId,
      targetType: b.target_type,
      targetId: id,
      reason: 'bulk',
      context
    })
    if (r) scored++
  }
  return { scored, total: ids.length }
})
