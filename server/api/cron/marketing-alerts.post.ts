// Hourly cron (pages-cron '0 * * * *'): notify-only marketing alerts — budget pacing, open
// marketing anomalies, Google policy limits, spend-sync failures and wasted search-term spend.
// Dormant until agency_settings key 'marketing_alerts' sets enabled: true; delivery channels are
// separately switched and the global staff-notification pause suppresses every send.
// Never changes a provider account. Auth: x-cron-secret vs CRON_SECRET.
import { defineEventHandler } from 'h3'
import { requireCronJobSecret } from '~~/server/utils/financeMachineAccess'
import { queryOne } from '~~/server/utils/db'
import { getAppUrl } from '~~/server/utils/appUrl'
import { runMarketingAlertsForTenant } from '~~/server/utils/marketingAlerts'

export default defineEventHandler(async (event) => {
  requireCronJobSecret(event)
  // Single-tenant prod: the connected Xero tenant when present, otherwise the legacy settings
  // tenant (same resolution as /api/cron/spend-auto-action).
  const conn = await queryOne<{ tenant_id: string }>(`SELECT tenant_id FROM xero_org_connection ORDER BY connected_at DESC LIMIT 1`)
  const tenantId = conn?.tenant_id || '__default__'
  const result = await runMarketingAlertsForTenant(tenantId, { appUrl: getAppUrl(event) })
  if (!('skipped' in result)) console.log('[marketing-alerts]', { tenantId, ...result })
  return result
})
