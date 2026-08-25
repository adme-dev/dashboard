import { z } from 'zod'
import { requireClientTrackingAccess } from '~~/server/utils/client-access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { parseCompetitionRow } from '~~/server/utils/qr/competitions'
import { CompetitionDetailsSchema, defaultPermits } from '~~/shared/qr/competition'

const Body = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  type: z.enum(['chance', 'skill']).default('chance'),
  timezone: z.string().trim().max(60).default('Australia/Melbourne'),
  opensAt: z.string().datetime({ offset: true }).nullable().default(null),
  closesAt: z.string().datetime({ offset: true }).nullable().default(null),
  details: CompetitionDetailsSchema.default(() => CompetitionDetailsSchema.parse({}))
}).strict()

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  const b = parsed.data
  const user = await requireClientTrackingAccess(event, b.clientId)
  const row = await executeQrMutation(event, 'competition-create', async (db) => {
    const r = await db.query(
      `INSERT INTO qr_competitions (client_id, name, type, timezone, opens_at, closes_at, details, permits, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.clientId, b.name, b.type, b.timezone, b.opensAt, b.closesAt, JSON.stringify(b.details), JSON.stringify(defaultPermits(b.details, b.type)), user.id])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_competitions WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed competition no longer exists')
    return r.rows[0]
  })
  return { competition: parseCompetitionRow(row) }
})
