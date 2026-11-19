// Persistence for marketing alerts (migration 517). Upserts are keyed on the open-alert dedupe
// key, so re-detecting the same open condition every hour updates one row (same stable id) rather
// than raising a new alert.
import { execute, queryRowsFresh } from '~~/server/utils/db'
import type { DetectedMarketingAlert, MarketingAlertSource, StoredMarketingAlert } from './types'

interface AlertRow {
  id: string
  dedupe_key: string
  source: MarketingAlertSource
  kind: string
  severity: StoredMarketingAlert['severity']
  client_id: string | null
  client_name: string | null
  platform: string | null
  account_ref: string | null
  campaign_ref: string | null
  summary: string
  next_step: string
  mcp_tool: string
  deep_link: string
  evidence: Record<string, unknown>
  first_detected_at: string
  severity_changed_at: string | null
  immediate_notified_at: string | null
  last_digest_at: string | null
}

const ALERT_COLUMNS = `id::text AS id, dedupe_key, source, kind, severity, client_id::text AS client_id, client_name,
  platform, account_ref, campaign_ref, summary, next_step, mcp_tool, deep_link, evidence,
  first_detected_at::text AS first_detected_at, severity_changed_at::text AS severity_changed_at,
  immediate_notified_at::text AS immediate_notified_at, last_digest_at::text AS last_digest_at`

function toStored(row: AlertRow): StoredMarketingAlert {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    source: row.source,
    kind: row.kind,
    severity: row.severity,
    clientId: row.client_id,
    clientName: row.client_name,
    platform: row.platform,
    accountRef: row.account_ref,
    campaignRef: row.campaign_ref,
    summary: row.summary,
    nextStep: row.next_step,
    mcpTool: row.mcp_tool,
    deepLink: row.deep_link,
    evidence: row.evidence ?? {},
    firstDetectedAt: row.first_detected_at,
    severityChangedAt: row.severity_changed_at,
    immediateNotifiedAt: row.immediate_notified_at,
    lastDigestAt: row.last_digest_at
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Insert new conditions, refresh open ones; returns how many rows were newly opened. */
export async function upsertMarketingAlerts(tenantId: string, alerts: DetectedMarketingAlert[]): Promise<{ opened: number, refreshed: number }> {
  if (alerts.length === 0) return { opened: 0, refreshed: 0 }
  const payload = alerts.map(a => ({
    dedupe_key: a.dedupeKey,
    source: a.source,
    kind: a.kind,
    severity: a.severity,
    client_id: a.clientId && UUID_RE.test(a.clientId) ? a.clientId : null,
    client_name: a.clientName,
    platform: a.platform,
    account_ref: a.accountRef,
    campaign_ref: a.campaignRef,
    summary: a.summary,
    next_step: a.nextStep,
    mcp_tool: a.mcpTool,
    deep_link: a.deepLink,
    evidence: a.evidence
  }))
  const rows = await queryRowsFresh<{ inserted: boolean }>(
    `INSERT INTO marketing_alerts (
       tenant_id, dedupe_key, source, kind, severity, client_id, client_name, platform, account_ref,
       campaign_ref, summary, next_step, mcp_tool, deep_link, evidence
     )
     SELECT $1, r.dedupe_key, r.source, r.kind, r.severity, r.client_id, r.client_name, r.platform, r.account_ref,
            r.campaign_ref, r.summary, r.next_step, r.mcp_tool, r.deep_link, COALESCE(r.evidence, '{}'::jsonb)
       FROM jsonb_to_recordset($2::jsonb) AS r(
         dedupe_key text, source text, kind text, severity text, client_id uuid, client_name text, platform text,
         account_ref text, campaign_ref text, summary text, next_step text, mcp_tool text, deep_link text, evidence jsonb
       )
     ON CONFLICT (tenant_id, dedupe_key) WHERE status = 'open'
     DO UPDATE SET
       severity = EXCLUDED.severity,
       severity_changed_at = CASE WHEN marketing_alerts.severity <> EXCLUDED.severity THEN NOW() ELSE marketing_alerts.severity_changed_at END,
       kind = EXCLUDED.kind,
       client_id = EXCLUDED.client_id,
       client_name = EXCLUDED.client_name,
       platform = EXCLUDED.platform,
       account_ref = EXCLUDED.account_ref,
       campaign_ref = EXCLUDED.campaign_ref,
       summary = EXCLUDED.summary,
       next_step = EXCLUDED.next_step,
       mcp_tool = EXCLUDED.mcp_tool,
       deep_link = EXCLUDED.deep_link,
       evidence = EXCLUDED.evidence,
       occurrences = marketing_alerts.occurrences + 1,
       last_detected_at = NOW(),
       updated_at = NOW()
     RETURNING (xmax = 0) AS inserted`,
    [tenantId, JSON.stringify(payload)]
  )
  const opened = rows.filter(r => r.inserted).length
  return { opened, refreshed: rows.length - opened }
}

/** Resolve open alerts of the evaluated sources whose condition was not detected this run.
 * Sources whose loader failed are NOT passed in, so a query error never mass-resolves alerts. */
export async function resolveClearedMarketingAlerts(
  tenantId: string,
  evaluatedSources: MarketingAlertSource[],
  stillOpenKeys: string[]
): Promise<number> {
  if (evaluatedSources.length === 0) return 0
  const rows = await queryRowsFresh<{ id: string }>(
    `UPDATE marketing_alerts
        SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
      WHERE tenant_id = $1
        AND status = 'open'
        AND source = ANY($2::text[])
        AND NOT (dedupe_key = ANY($3::text[]))
      RETURNING id::text AS id`,
    [tenantId, evaluatedSources, stillOpenKeys]
  )
  return rows.length
}

export async function listOpenMarketingAlerts(tenantId: string): Promise<StoredMarketingAlert[]> {
  const rows = await queryRowsFresh<AlertRow>(
    `SELECT ${ALERT_COLUMNS}
       FROM marketing_alerts
      WHERE tenant_id = $1 AND status = 'open'
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, first_detected_at DESC`,
    [tenantId]
  )
  return rows.map(toStored)
}

export async function markImmediateNotified(alertIds: string[]): Promise<void> {
  if (!alertIds.length) return
  await execute(
    `UPDATE marketing_alerts SET immediate_notified_at = NOW(), updated_at = NOW() WHERE id = ANY($1::uuid[])`,
    [alertIds]
  )
}

export async function markDigested(alertIds: string[]): Promise<void> {
  if (!alertIds.length) return
  await execute(
    `UPDATE marketing_alerts SET last_digest_at = NOW(), updated_at = NOW() WHERE id = ANY($1::uuid[])`,
    [alertIds]
  )
}

export type DeliveryStatus = 'sent' | 'failed' | 'suppressed_paused' | 'skipped_no_target'

export async function recordDelivery(entry: {
  tenantId: string
  kind: 'immediate' | 'digest'
  channel: 'slack' | 'in_app' | 'none'
  status: DeliveryStatus
  alertIds: string[]
  localDate: string
  detail?: string | null
}): Promise<void> {
  await execute(
    `INSERT INTO marketing_alert_deliveries (tenant_id, delivery_kind, channel, status, alert_ids, local_date, detail)
     VALUES ($1, $2, $3, $4, $5::uuid[], $6::date, $7)`,
    [entry.tenantId, entry.kind, entry.channel, entry.status, entry.alertIds, entry.localDate, entry.detail ?? null]
  )
}

/** True once today's digest has been handled on this channel (sent, suppressed or had no target) —
 * one per day per channel. A failed send is retried on the next hourly run within the digest hour. */
export async function digestAlreadyHandled(tenantId: string, localDate: string, channel: 'slack' | 'in_app'): Promise<boolean> {
  const rows = await queryRowsFresh<{ id: string }>(
    `SELECT id::text AS id FROM marketing_alert_deliveries
      WHERE tenant_id = $1 AND delivery_kind = 'digest' AND local_date = $2::date AND channel = $3
        AND status IN ('sent', 'suppressed_paused', 'skipped_no_target')
      LIMIT 1`,
    [tenantId, localDate, channel]
  )
  return rows.length > 0
}
