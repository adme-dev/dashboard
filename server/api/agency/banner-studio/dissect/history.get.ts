import { requireAuth } from '~~/server/utils/auth'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { z } from 'zod'
import { assertDissectionAccess, dissectionHistoryScope, resolveDissectionContext } from '~~/server/utils/banner/dissectionAccess'
import { dissectionIngestionProjection, type DissectionRecord } from '~~/server/utils/banner/dissectionJobs'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const parsed = z.object({ projectId: z.string().uuid().optional(), clientId: z.string().uuid().optional() }).strict().safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid dissection history context' })
  return transactionWithoutRetry(async (db) => {
    await resolveDissectionContext(db, user.id, parsed.data)
    const scope = await dissectionHistoryScope(db, user.id, parsed.data)
    const personal = !parsed.data.projectId && !parsed.data.clientId
      ? `AND (d.manifest IS NULL OR d.manifest = 'null'::jsonb OR NOT (d.manifest ? 'ingestion') OR d.manifest->'ingestion'->'owner'->>'kind' = 'user')`
      : ''
    const { rows } = await db.query<DissectionRecord & { user_id: string }>(
      `SELECT d.* FROM banner_dissections d WHERE ${scope.sql} ${personal}
       ORDER BY d.created_at DESC, d.job_id LIMIT 50`, scope.params
    )
    // Validate full immutable metadata and fresh access before projecting any row.
    for (const row of rows) await assertDissectionAccess(db, user.id, row, 'read')
    return { dissections: rows.map(row => ({ jobId: row.job_id, status: row.status,
      brand: row.brand || row.manifest?.brand, bannerSize: row.manifest?.banner_size,
      createdAt: row.created_at, ...dissectionIngestionProjection(row) })) }
  })
})
