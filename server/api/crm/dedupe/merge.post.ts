// server/api/crm/dedupe/merge.post.ts — merge a duplicate contact into a survivor.
// Admin-gated; all child reassignment + loser deletion + logging is one transaction.
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { mergeContacts } from '~~/server/utils/crm/dedupe'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  entity_type: z.enum(['person', 'company']),
  winner_id: z.string().uuid(),
  loser_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  if (b.winner_id === b.loser_id) throw createError({ statusCode: 400, statusMessage: 'Winner and loser must differ' })
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  try {
    const counts = await mergeContacts({
      context, clientId: context.clientId, entityType: b.entity_type,
      winnerId: b.winner_id, loserId: b.loser_id, actor: context.actorId,
    })
    return { ok: true, reassigned: counts }
  } catch (e: any) {
    if (e?.statusCode === 404) throw e
    throw createError({ statusCode: 400, statusMessage: e?.message || 'Merge failed' })
  }
})
