import { z } from 'zod'
import { createHash } from 'node:crypto'
import { requireCompetitionAccess, parseCompetitionRow } from '~~/server/utils/qr/competitions'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { CompetitionDetailsSchema, PermitRowSchema, generateTerms } from '~~/shared/qr/competition'

const Body = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  type: z.enum(['chance', 'skill']).optional(),
  status: z.enum(['draft', 'open', 'closed', 'archived']).optional(),
  timezone: z.string().trim().max(60).optional(),
  opensAt: z.string().datetime({ offset: true }).nullable().optional(),
  closesAt: z.string().datetime({ offset: true }).nullable().optional(),
  details: CompetitionDetailsSchema.optional(),
  permits: z.array(PermitRowSchema).max(8).optional(),
  /** Regenerate + version the T&Cs from the (updated) fields. */
  versionTerms: z.boolean().optional()
}).strict()

export default defineEventHandler(async (event) => {
  const { user, row } = await requireCompetitionAccess(event, getRouterParam(event, 'id'))
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid body' })
  const b = parsed.data
  if (b.status === 'open' && row.status === 'drawn') throw createError({ statusCode: 409, statusMessage: 'A drawn competition cannot be reopened' })
  if (b.status === 'open' && (row.terms_current_version === 0 && !b.versionTerms)) throw createError({ statusCode: 409, statusMessage: 'Generate the terms and conditions before opening entries' })

  const next = {
    name: b.name ?? row.name, type: b.type ?? row.type, status: b.status ?? row.status, timezone: b.timezone ?? row.timezone,
    opens_at: b.opensAt === undefined ? row.opens_at : b.opensAt, closes_at: b.closesAt === undefined ? row.closes_at : b.closesAt,
    details: b.details ?? row.details, permits: b.permits ?? row.permits
  }
  const updated = await executeQrMutation(event, 'competition-update', async (db) => {
    let version = row.terms_current_version
    if (b.versionTerms) {
      const md = generateTerms({ name: next.name, type: next.type, timezone: next.timezone, opensAt: next.opens_at, closesAt: next.closes_at, details: next.details, permits: next.permits })
      const sha = createHash('sha256').update(md).digest('hex')
      const last = await db.query(`SELECT sha256 FROM qr_competition_terms_versions WHERE competition_id = $1 ORDER BY version DESC LIMIT 1`, [row.id])
      if (last.rows[0]?.sha256 !== sha) {
        version = row.terms_current_version + 1
        await db.query(`INSERT INTO qr_competition_terms_versions (competition_id, version, terms_md, sha256, created_by) VALUES ($1,$2,$3,$4,$5)`, [row.id, version, md, sha, user.id])
      }
    }
    const r = await db.query(
      `UPDATE qr_competitions SET name=$2, type=$3, status=$4, timezone=$5, opens_at=$6, closes_at=$7, details=$8, permits=$9, terms_current_version=$10, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [row.id, next.name, next.type, next.status, next.timezone, next.opens_at, next.closes_at, JSON.stringify(next.details), JSON.stringify(next.permits), version])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_competitions WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed competition no longer exists')
    return r.rows[0]
  })
  return { competition: parseCompetitionRow(updated) }
})
