import { queryRows, transaction } from '~~/server/utils/db'
import { queueAnomalyNotification } from './notify'
import type { DetectedAnomaly, AnomalyRow } from './types'

export interface ReconcileResult {
  inserted: number
  updated: number
  resolved: number
  unsnoozed: number
  notifications_queued: number
}

const notificationsDisabled = () =>
  process.env.ANOMALY_NOTIFICATIONS_DISABLED === 'true'

export async function reconcile(
  tenantId: string,
  detected: DetectedAnomaly[],
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    inserted: 0, updated: 0, resolved: 0, unsnoozed: 0, notifications_queued: 0,
  }

  // Active = not resolved/dismissed.
  const activeRows: AnomalyRow[] = await queryRows<AnomalyRow>(
    `SELECT * FROM anomalies
     WHERE tenant_id = $1 AND status NOT IN ('resolved','dismissed')`,
    [tenantId],
  )

  const byFingerprint = new Map(activeRows.map(r => [r.fingerprint, r]))
  const detectedFingerprints = new Set(detected.map(d => d.fingerprint))
  const newlyInsertedCriticalIds: string[] = []

  await transaction(async (client) => {
    // Pass 1: insert/update for each detected anomaly
    for (const det of detected) {
      const existing = byFingerprint.get(det.fingerprint)

      if (!existing) {
        const ins = await client.query(
          `INSERT INTO anomalies
            (tenant_id, fingerprint, type, severity, status, title, description,
             recommendation, tags, data_sources, metric, comparison, context,
             group_key, notification_sent_at)
           VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING id, severity`,
          [
            tenantId, det.fingerprint, det.type, det.severity,
            det.title, det.description,
            det.recommendation ?? null,
            det.tags ?? null,
            det.dataSources,
            det.metric ? JSON.stringify(det.metric) : null,
            det.comparison ? JSON.stringify(det.comparison) : null,
            det.context ? JSON.stringify(det.context) : null,
            det.groupKey ?? null,
            det.severity === 'critical' && !notificationsDisabled() ? new Date() : null,
          ],
        )
        const row = (ins as any).rows[0]
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event, metadata) VALUES ($1, $2, $3)`,
          [row.id, 'detected', JSON.stringify({ severity: det.severity })],
        )
        result.inserted++
        if (det.severity === 'critical' && !notificationsDisabled()) {
          newlyInsertedCriticalIds.push(row.id)
        }
        continue
      }

      // Re-detection of an existing active row.
      // Snooze housekeeping: if the row is snoozed and snooze has expired,
      // flip back to 'open' atomically with this update.
      const wasSnoozedAndExpired =
        existing.status === 'snoozed' &&
        !!existing.snoozed_until &&
        new Date(existing.snoozed_until) <= new Date()

      const newStatus = wasSnoozedAndExpired ? 'open' : existing.status

      await client.query(
        `UPDATE anomalies
           SET last_detected_at = NOW(),
               severity = $1,
               title = $2,
               description = $3,
               recommendation = $4,
               tags = $5,
               metric = $6,
               comparison = $7,
               context = $8,
               group_key = $9,
               status = $10,
               snoozed_until = CASE WHEN $11::boolean THEN NULL ELSE snoozed_until END
         WHERE id = $12`,
        [
          det.severity, det.title, det.description, det.recommendation ?? null,
          det.tags ?? null,
          det.metric ? JSON.stringify(det.metric) : null,
          det.comparison ? JSON.stringify(det.comparison) : null,
          det.context ? JSON.stringify(det.context) : null,
          det.groupKey ?? null,
          newStatus,
          wasSnoozedAndExpired,
          existing.id,
        ],
      )

      if (wasSnoozedAndExpired) {
        await client.query(
          `INSERT INTO anomaly_events (anomaly_id, event) VALUES ($1, $2)`,
          [existing.id, 'unsnoozed'],
        )
        result.unsnoozed++
      }

      await client.query(
        `INSERT INTO anomaly_events (anomaly_id, event) VALUES ($1, $2)`,
        [existing.id, 're-detected'],
      )
      result.updated++
    }

    // Pass 2: resolve active rows whose fingerprint wasn't detected this run.
    for (const row of activeRows) {
      if (detectedFingerprints.has(row.fingerprint)) continue
      await client.query(
        `UPDATE anomalies
           SET status = 'resolved', resolved_at = NOW()
         WHERE id = $1`,
        [row.id],
      )
      await client.query(
        `INSERT INTO anomaly_events (anomaly_id, event, metadata) VALUES ($1, $2, $3)`,
        [row.id, 'resolved', JSON.stringify({ reason: 'no-longer-detected' })],
      )
      result.resolved++
    }
  })

  // Pass 3 (post-transaction): queue notifications for newly-inserted critical rows.
  for (const id of newlyInsertedCriticalIds) {
    try {
      await queueAnomalyNotification(id)
      result.notifications_queued++
    } catch (err) {
      console.error('[anomalies] notification queue failed for', id, err)
      // Best-effort: row already persisted with notification_sent_at.
    }
  }

  return result
}
