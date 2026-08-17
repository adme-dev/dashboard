import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne } from '~~/server/utils/db'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { getSpendAutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'
import { decideAutoActions } from '~~/server/utils/spendAutoAction'
import { executeAutoActions } from '~~/server/utils/spendAutoActionExecutor'
import { recordCampaignAction } from '~~/server/utils/campaignActionLog'
import { createNotification } from '~~/server/utils/notifications'

/**
 * Hourly cron (x-cron-secret). On the pacing detectors, applies the per-severity
 * auto-action policy: notify and/or auto-PROPOSE a planned budget adjustment.
 * NO autonomous platform write — proposals land in the approve→apply queue.
 * No-op while the policy is disabled (the shipped default).
 */
export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  // Single-tenant prod: use the connected Xero tenant when present, otherwise
  // retain the legacy tenant that owns settings in installations without Xero.
  const conn = await queryOne<{ tenant_id: string }>(`SELECT tenant_id FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`)
  const tenantId = conn?.tenant_id || '__default__'
  const policy = await getSpendAutoActionPolicy(tenantId)
  if (!policy.enabled) return { ok: true, skipped: 'disabled' }

  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const rows = await queryRows<PacingReviewRow>(
    `SELECT ${PACING_REVIEW_SELECT_COLUMNS}
     FROM media_spend ms LEFT JOIN agency_clients ac ON ac.id = ms.client_id
     WHERE ms.period = $1 AND ms.platform IN ('meta','google_ads')
     ORDER BY ms.actual_spend DESC`,
    [period]
  )
  const review = buildPacingReview(rows, { now, period })
  const decisions = decideAutoActions(review.items, policy)
  if (decisions.length === 0) return { ok: true, proposed: 0, notified: 0, skipped: 0 }

  // Notify recipients: owner/admin team members (the surface that can act).
  const recipients = await queryRows<{ id: string }>(
    `SELECT id::text AS id FROM team_members WHERE user_role IN ('owner','admin') AND is_active = true`
  ).catch(() => [])

  const result = await executeAutoActions(decisions, {
    recordCampaignAction,
    hasOpenAutoAction: async (mediaSpendId, dailyBudget) => {
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM campaign_action_log
         WHERE media_spend_id = $1 AND action_type = 'budget_update'
           AND action_status IN ('planned','approved') AND metadata->>'source' = 'auto_action'
           AND (new_value->>'dailyBudget')::numeric = $2 LIMIT 1`,
        [mediaSpendId, dailyBudget]
      )
      return !!existing
    },
    notify: async (item) => {
      for (const r of recipients) {
        await createNotification({
          userId: r.id,
          type: 'anomaly_critical',
          title: `Ad-spend pacing (${item.severity}): ${item.clientName || 'campaign'}`,
          message: item.recommendedAction || `${item.issueType} detected`,
          link: '/agency/social/spend',
          reason: 'direct'
        }).catch(() => {})
      }
    }
  })
  return { ok: true, ...result }
})
