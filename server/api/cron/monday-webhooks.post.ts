import { createError, getHeader, setHeader } from 'h3'
import { queryRows, execute } from '~~/server/utils/db'
import { classifyMondayWebhookEvent } from '~~/server/utils/mondayWebhookReconcile'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const events = await queryRows<{
    id: string
    eventId: string
    eventType: string | null
    itemId: string | null
    receivedAt: string
  }>(
    `SELECT id, monday_event_id AS "eventId", event_type AS "eventType",
            item_id AS "itemId", received_at AS "receivedAt"
       FROM monday_webhook_events
      WHERE status = 'queued'
      ORDER BY received_at LIMIT 100`,
  )
  let processed = 0
  let failed = 0
  for (const webhook of events) {
    try {
      const classification = classifyMondayWebhookEvent(webhook.eventType)
      if (webhook.itemId && classification.action === 'reconcile') {
        await execute(
          `UPDATE monday_item_mappings
              SET archived = $1,
                  source_state = $2,
                  reconciliation_status = $3,
                  source_updated_at = $4::timestamptz,
                  last_webhook_event_id = $5,
                  updated_at = NOW()
            WHERE id = (
              SELECT id FROM monday_item_mappings
               WHERE monday_item_id = $6
               ORDER BY created_at DESC, updated_at DESC
               LIMIT 1
            )
              AND (last_seen_at IS NULL OR last_seen_at < $4::timestamptz)
              AND (source_updated_at IS NULL OR source_updated_at <= $4::timestamptz)`,
          [
            classification.sourceState !== 'active',
            classification.sourceState,
            classification.reconciliationStatus,
            webhook.receivedAt,
            webhook.eventId,
            webhook.itemId,
          ],
        )
      }
      await execute(`UPDATE monday_webhook_events SET status = 'processed', processed_at = NOW() WHERE id = $1`, [webhook.id])
      processed++
    } catch (error: any) {
      await execute(`UPDATE monday_webhook_events SET status = 'failed', error_message = $1 WHERE id = $2`, [String(error?.message || error).slice(0, 2000), webhook.id])
      failed++
    }
  }
  return { ok: true, scanned: events.length, processed, failed }
})
