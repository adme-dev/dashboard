// server/utils/anomalyDetection/notify.ts
import { queryOne, queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { sendAnomalyAlertEmail } from '~~/server/utils/email'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { resolveUserPermissions } from '~~/server/utils/roleResolver'
import { hasRole } from '~~/server/utils/auth'
import type { AnomalyRow } from './types'

const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://agency-dashboard-6cm.pages.dev'

interface Recipient {
  id: string
  email: string
  name: string | null
}

interface RawTeamMember {
  id: string
  email: string
  name: string | null
  role: string
  custom_role_id: string | null
}

/**
 * Fan a critical anomaly out to every team_member with FINANCE permission.
 *
 * Recipient resolution uses resolveUserPermissions + hasRole — the same path
 * as the rest of the codebase. This honours both legacy role slugs ('owner',
 * 'admin', 'finance') AND users whose permission_groups are resolved via a
 * custom role (e.g. 'Account Manager', 'Media Buyer' with a Finance group).
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

  const members = await queryRows<RawTeamMember>(
    `SELECT id::text AS id, email, name, role, custom_role_id::text AS custom_role_id
     FROM team_members
     WHERE email IS NOT NULL AND email <> ''
       AND is_active = true`,
  )

  const recipients: Recipient[] = []
  for (const m of members) {
    let permissionGroups: string[] | undefined
    try {
      // resolveUserPermissions caches per-user via KV — passing null event
      // bypasses cache but the function still resolves correctly from DB.
      const resolved = await resolveUserPermissions(null as any, m.id, m.role, m.custom_role_id)
      permissionGroups = resolved.groups
    } catch (err) {
      // If resolution fails (e.g. KV unavailable), fall through to legacy match
      permissionGroups = undefined
    }
    const synthetic = { role: m.role, permissionGroups } as { role: string; permissionGroups?: string[] }
    if (hasRole(synthetic as any, PERMISSIONS.FINANCE)) {
      recipients.push({ id: m.id, email: m.email, name: m.name })
    }
  }

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
