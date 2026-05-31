/** Purge tracking_events older than each site's retention_days. Cron-gated.
 *  Wire in CF dashboard: POST with header x-cron-secret: $CRON_SECRET, daily.
 *  (/api/cron/ is already exempt from auth middleware; this verifies the secret
 *  inline so the route stays unauthenticated but protected.) */
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const deleted = await execute(
    `DELETE FROM tracking_events e
       USING tracking_sites s
      WHERE e.site_id = s.id
        AND e.received_at < NOW() - MAKE_INTERVAL(days => s.retention_days)`
  )
  return { ok: true, deleted }
})
