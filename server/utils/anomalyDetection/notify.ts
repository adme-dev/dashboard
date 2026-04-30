// server/utils/anomalyDetection/notify.ts
import { queryOne, queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { sendAnomalyAlertEmail } from '~~/server/utils/email'
import { PERMISSIONS } from '~~/server/utils/permissions'
import type { AnomalyRow } from './types'

const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://agency-dashboard-6cm.pages.dev'

interface Recipient {
  id: string
  email: string
  name: string | null
}

/**
 * Fan a critical anomaly out to every team_member with FINANCE permission.
 *
 * Recipient resolution: direct role-string match against PERMISSIONS.FINANCE.
 * In the current schema, team_members.role contains BOTH legacy permission
 * slugs ('owner', 'admin', 'finance', etc.) AND display strings ('Account
 * Manager', 'Media Buyer'). The display strings won't match here — only users
 * whose role is one of the legacy slugs will be notified. For the live data
 * that's at minimum the org owner. To extend coverage, either change the
 * staff member's role string or add a routing layer here.
 *
 * No-ops if env flag ANOMALY_NOTIFICATIONS_DISABLED=true (used by the
 * backfill script in P3.5).
 */
export async function queueAnomalyNotification(anomalyId: string): Promise<void> {
  if (process.env.ANOMALY_NOTIFICATIONS_DISABLED === 'true') return

  const anomaly = await queryOne<AnomalyRow>(
    `SELECT * FROM anomalies WHERE id = $1`,
    [anomalyId],
  )
  if (!anomaly) return

  const financeRoles = PERMISSIONS.FINANCE
  const recipients = await queryRows<Recipient>(
    `SELECT id::text AS id, email, name
     FROM team_members
     WHERE email IS NOT NULL AND email <> ''
       AND role = ANY($1)`,
    [financeRoles as unknown as string[]],
  )

  if (recipients.length === 0) {
    console.warn('[anomalies notify] no recipients for finance permission — skipping fan-out')
    return
  }

  const url = `${BASE_URL}/anomalies?focus=${anomaly.id}`
  const metricLabel = anomaly.metric?.label
  const metricValue = formatMetricForEmail(anomaly.metric)

  for (const r of recipients) {
    // In-app (Smart Watch) — gates on the user's notification_preferences via createNotification.
    try {
      await createNotification({
        userId: r.id,
        type: 'anomaly_critical',
        title: anomaly.title,
        message: anomaly.description,
        link: `/anomalies?focus=${anomaly.id}`,
        metadata: { anomalyId: anomaly.id, fingerprint: anomaly.fingerprint, severity: anomaly.severity },
        reason: 'direct',
      })
    } catch (err) {
      console.error('[anomalies notify] in-app failed for', r.id, err)
    }

    // Email
    try {
      await sendAnomalyAlertEmail({
        to: r.email,
        name: r.name || 'there',
        title: anomaly.title,
        description: anomaly.description,
        metricLabel,
        metricValue,
        recommendation: anomaly.recommendation || undefined,
        url,
      })
    } catch (err) {
      console.error('[anomalies notify] email failed for', r.email, err)
    }
  }
}

function formatMetricForEmail(metric: AnomalyRow['metric']): string | undefined {
  if (!metric) return undefined
  const v = Number(metric.value)
  if (!Number.isFinite(v)) return undefined
  if (metric.format === 'currency') return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (metric.format === 'percent') return `${(v * 100).toFixed(1)}%`
  return v.toLocaleString()
}
