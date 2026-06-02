import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { syncOwnedSignals } from '~~/server/utils/socialListening/store'

/** POST /api/agency/social/listening/sync-owned { clientId } — project inbox conversations into
 *  owned listening mentions. Ungated, human/cron-triggerable (no external calls, no sends). */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const b = await readBody(event)
  if (!b?.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const count = await syncOwnedSignals({ queryRows, queryOne, execute }, String(b.clientId))
  return { ok: true, synced: count }
})
