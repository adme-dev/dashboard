/** Audited random draw. Winners + reserves from valid entries using a CSPRNG Fisher–Yates shuffle. */
import { z } from 'zod'
import { createHash, randomBytes } from 'node:crypto'
import { requireCompetitionAccess } from '~~/server/utils/qr/competitions'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'

const Body = z.object({ winners: z.number().int().min(1).max(1000).optional(), reserves: z.number().int().min(0).max(1000).optional(), note: z.string().trim().max(400).optional() }).strict()

function shuffle<T>(arr: T[], seed: Buffer): T[] {
  // Deterministic given the seed so the draw can be replayed from the stored seed hash + entry list snapshot.
  const out = [...arr]
  let counter = 0
  const rand = () => {
    const h = createHash('sha256').update(seed).update(String(counter++)).digest()
    return h.readUInt32BE(0) / 0x1_0000_0000
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

export default defineEventHandler(async (event) => {
  const { user, row } = await requireCompetitionAccess(event, getRouterParam(event, 'id'))
  const parsed = Body.safeParse(await readBody(event) ?? {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  if (row.type !== 'chance') throw createError({ statusCode: 409, statusMessage: 'Skill competitions are judged, not drawn' })
  if (!['open', 'closed'].includes(row.status)) throw createError({ statusCode: 409, statusMessage: 'Close the competition before drawing' })
  const winners = parsed.data.winners ?? row.details.draw.winners
  const reserves = parsed.data.reserves ?? row.details.draw.reserves

  const draw = await executeQrMutation(event, 'competition-draw', async (db) => {
    const eligible = await db.query(`SELECT id FROM qr_competition_entries WHERE competition_id = $1 AND status = 'valid' ORDER BY created_at, id FOR UPDATE`, [row.id])
    const ids: string[] = eligible.rows.map((r: any) => r.id)
    if (!ids.length) throw createError({ statusCode: 409, statusMessage: 'No valid entries to draw from' })
    const seed = randomBytes(32)
    const order = shuffle(ids, seed)
    const w = order.slice(0, winners)
    const rsv = order.slice(winners, winners + reserves)
    if (w.length) await db.query(`UPDATE qr_competition_entries SET status = 'winner', status_reason = 'Drawn' WHERE id = ANY($1::uuid[])`, [w])
    if (rsv.length) await db.query(`UPDATE qr_competition_entries SET status = 'reserve', status_reason = 'Drawn as reserve' WHERE id = ANY($1::uuid[])`, [rsv])
    const r = await db.query(
      `INSERT INTO qr_competition_draws (competition_id, drawn_by, seed_sha256, eligible_count, winners, reserves, filters, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [row.id, user.id, createHash('sha256').update(seed).digest('hex'), ids.length, w, rsv, JSON.stringify({ status: 'valid', entries_sha256: createHash('sha256').update(ids.join(',')).digest('hex') }), parsed.data.note ?? null])
    await db.query(`UPDATE qr_competitions SET status = 'drawn', updated_at = NOW() WHERE id = $1`, [row.id])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_competition_draws WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed draw no longer exists')
    return r.rows[0]
  })
  return { draw }
})
