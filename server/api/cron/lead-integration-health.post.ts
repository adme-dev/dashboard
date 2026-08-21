import { queryOne, queryRows } from '~~/server/utils/db'
import { createBulkNotifications } from '~~/server/utils/notifications'
import {
  deriveLeadHealthIssues,
  getLeadHealthSnapshot
} from '~~/server/utils/leads/leadHealth'
import type { LeadCaptureMode } from '~~/server/utils/leads/acceptance'

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default defineEventHandler(async (event) => {
  const supplied = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && (!process.env.CRON_SECRET || supplied !== process.env.CRON_SECRET)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const clients = await queryRows<{
    id: string
    name: string
    lead_capture_mode: LeadCaptureMode
  }>(
    `SELECT client.id, client.name, client.lead_capture_mode
       FROM agency_clients client
      WHERE client.lead_capture_mode <> 'analytics_only'
        AND (
          EXISTS (SELECT 1 FROM tracking_sites site WHERE site.client_id = client.id AND site.is_active)
          OR EXISTS (
            SELECT 1
              FROM lead_webhook_endpoints endpoint
             WHERE endpoint.client_id = client.id
          )
        )`
  )

  const toDate = dateOnly(new Date())
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - 7)
  const fromDate = dateOnly(from)
  let notified = 0
  let activeIssues = 0

  for (const client of clients) {
    const snapshot = await getLeadHealthSnapshot(client.id, fromDate, toDate)
    const issues = deriveLeadHealthIssues(snapshot, client.lead_capture_mode)
    const activeCodes = issues.map(issue => issue.code)
    activeIssues += issues.length

    await queryOne(
      `UPDATE lead_integration_alert_state
          SET resolved_at = NOW()
        WHERE client_id = $1
          AND resolved_at IS NULL
          AND NOT (issue_code = ANY($2::text[]))
        RETURNING client_id`,
      [client.id, activeCodes]
    )

    if (!issues.length) continue

    const recipients = await queryRows<{ team_member_id: string }>(
      `SELECT DISTINCT team_member_id
         FROM client_team_assignments
        WHERE client_id = $1
          AND role IN ('primary_am', 'secondary_am')`,
      [client.id]
    )
    const userIds = recipients.map(recipient => recipient.team_member_id)

    for (const issue of issues) {
      const state = await queryOne<{ last_notified_at: string | null }>(
        `INSERT INTO lead_integration_alert_state (
           client_id, issue_code, first_detected_at, last_detected_at, resolved_at
         ) VALUES ($1, $2, NOW(), NOW(), NULL)
         ON CONFLICT (client_id, issue_code) DO UPDATE
           SET last_detected_at = NOW(), resolved_at = NULL
         RETURNING last_notified_at`,
        [client.id, issue.code]
      )
      const lastNotified = state?.last_notified_at
        ? new Date(state.last_notified_at).getTime()
        : 0
      if (!userIds.length || Date.now() - lastNotified < 24 * 60 * 60 * 1000) continue

      const delivery = await createBulkNotifications(userIds, {
        type: 'lead',
        reason: 'direct',
        title: `Lead integration: ${client.name}`,
        message: issue.message,
        link: `/agency/leads?clientId=${client.id}`,
        metadata: {
          clientId: client.id,
          issueCode: issue.code,
          severity: issue.severity
        }
      })
      if (delivery.successful > 0) {
        notified += delivery.successful
        await queryOne(
          `UPDATE lead_integration_alert_state
              SET last_notified_at = NOW()
            WHERE client_id = $1 AND issue_code = $2
            RETURNING client_id`,
          [client.id, issue.code]
        )
      }
    }
  }

  return { ok: true, clients: clients.length, activeIssues, notified }
})
