/** Purge tracking_events older than each site's retention_days. Cron-gated.
 *  Wire in CF dashboard: POST with header x-cron-secret: $CRON_SECRET, daily.
 *  (/api/cron/ is already exempt from auth middleware; this verifies the secret
 *  inline so the route stays unauthenticated but protected.) */
import { db, execute } from '~~/server/utils/db'
import { reconcileConfirmedBrowserLeadEvents } from '~~/server/utils/leads/browserConfirmation'

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
  const deletedIntents = await execute(
    `DELETE FROM lead_submission_intents
      WHERE expires_at < NOW()
         OR (matched_at IS NOT NULL AND matched_at < NOW() - INTERVAL '30 days')`
  )
  const repairedConfirmations = await reconcileConfirmedBrowserLeadEvents(db)
  return { ok: true, deleted, deletedIntents, repairedConfirmations }
})
