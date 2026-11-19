// Production wiring for the marketing alerts pipeline. See run.ts for the pass itself.
// Static imports only: Rollup does not track call sites made through dynamic-import namespaces
// and can erase their parameters in the prod bundle (see the 2026-08-20 god-mode incident).
import { queryRowsFresh } from '~~/server/utils/db'
import { isUserMemberNotificationDeliveryDisabled } from '~~/server/utils/notificationDelivery'
import { postSlack, validateWebhook } from '~~/server/utils/anomalyDetection/slackBudget'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'
import { createNotification } from '~~/server/utils/notifications'
import { getMarketingAlertsConfig } from './config'
import { deliverMarketingAlerts } from './delivery'
import { localClock, runMarketingAlerts, type MarketingAlertsRunResult } from './run'
import {
  loadGooglePolicyRows,
  loadLatestSpendSyncJobs,
  loadOpenMarketingAnomalies,
  loadPacingRows,
  loadSearchTermRows
} from './sources'
import {
  digestAlreadyHandled,
  listOpenMarketingAlerts,
  markDigested,
  markImmediateNotified,
  recordDelivery,
  resolveClearedMarketingAlerts,
  upsertMarketingAlerts
} from './store'

export async function runMarketingAlertsForTenant(tenantId: string, opts: { appUrl: string, now?: Date }): Promise<MarketingAlertsRunResult> {
  return runMarketingAlerts({
    loadConfig: () => getMarketingAlertsConfig(tenantId),
    sources: {
      pacing: period => loadPacingRows(period),
      anomalies: () => loadOpenMarketingAnomalies(),
      policy: period => loadGooglePolicyRows(period),
      syncJobs: () => loadLatestSpendSyncJobs(),
      searchTerms: (period, config) => loadSearchTermRows(period, config.thresholds)
    },
    store: {
      upsert: alerts => upsertMarketingAlerts(tenantId, alerts),
      resolveCleared: (sources, keys) => resolveClearedMarketingAlerts(tenantId, sources, keys),
      listOpen: () => listOpenMarketingAlerts(tenantId)
    },
    delivery: (open, ctx) => {
      const localDate = localClock(ctx.now, ctx.config.timezone).date
      return deliverMarketingAlerts(open, { ...ctx, appUrl: opts.appUrl }, {
        isPaused: () => isUserMemberNotificationDeliveryDisabled(),
        postSlack: (url, blocks, channel) => postSlack(url, blocks, channel),
        loadBudgetSlackWebhook: async () => {
          const cfg = await getBudgetSlackConfig(tenantId)
          const valid = !!cfg.webhook_url && validateWebhook(cfg.webhook_url)
          return { webhookUrl: valid ? cfg.webhook_url : null, channel: cfg.channel }
        },
        resolveRecipientIds: async (emails) => {
          if (!emails.length) return []
          const rows = await queryRowsFresh<{ id: string }>(
            `SELECT id::text AS id FROM team_members WHERE is_active = TRUE AND LOWER(email) = ANY($1::text[])`,
            [emails]
          )
          return rows.map(r => r.id)
        },
        notify: (userId, params) => createNotification({ userId, type: 'system', reason: 'direct', ...params }),
        recordDelivery: entry => recordDelivery({ tenantId, localDate, ...entry }),
        digestAlreadyHandled: channel => digestAlreadyHandled(tenantId, localDate, channel),
        markImmediateNotified: ids => markImmediateNotified(ids),
        markDigested: ids => markDigested(ids)
      })
    }
  }, opts.now)
}
