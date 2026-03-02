import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const rows = await queryRows(
    `SELECT
       job_id AS "jobId",
       status,
       COALESCE(brand, manifest->>'brand') AS brand,
       manifest->>'banner_size' AS "bannerSize",
       source_r2_key AS "sourceR2Key",
       created_at AS "createdAt"
     FROM banner_dissections
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [user.id]
  )

  return { dissections: rows }
})
