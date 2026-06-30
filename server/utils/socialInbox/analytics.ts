export interface SocialInboxAnalyticsInput {
  clientId: string
  days: number
}

export interface SocialInboxAnalyticsQuery {
  sql: string
  params: [string, number]
}

export type SocialInboxAnalyticsDimension = 'channel_type' | 'platform'

export interface SocialInboxAnalyticsDb {
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>
  queryRows<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface SocialInboxAnalyticsSummaryRow {
  total?: number | string | null
  open_count?: number | string | null
  closed_count?: number | string | null
  responded?: number | string | null
  sla_tracked?: number | string | null
  breaches?: number | string | null
  within_sla?: number | string | null
  due_soon?: number | string | null
  overdue_open?: number | string | null
  linked_tasks?: number | string | null
  linked_client_requests?: number | string | null
  converted?: number | string | null
  avg_first_response_minutes?: number | string | null
}

export interface SocialInboxAutomationRow {
  auto?: number | string | null
  sent?: number | string | null
}

export interface SocialInboxAnalyticsBreakdownRow {
  key?: string | null
  total?: number | string | null
  open_count?: number | string | null
  responded?: number | string | null
  sla_tracked?: number | string | null
  breaches?: number | string | null
  within_sla?: number | string | null
  converted?: number | string | null
  avg_first_response_minutes?: number | string | null
}

export interface SocialInboxAnalyticsBreakdown {
  key: string
  label: string
  total: number
  open: number
  responded: number
  avgFirstResponseMinutes: number
  slaTracked: number
  breaches: number
  withinSlaPct: number | null
  converted: number
  conversionRatePct: number
}

export interface SocialInboxAnalyticsResult {
  total: number
  open: number
  closed: number
  responded: number
  responseRatePct: number
  avgFirstResponseMinutes: number
  slaTracked: number
  breaches: number
  dueSoon: number
  overdueOpen: number
  withinSlaPct: number | null
  linkedTasks: number
  linkedClientRequests: number
  converted: number
  conversionRatePct: number
  automationRatePct: number
  byChannel: SocialInboxAnalyticsBreakdown[]
  byPlatform: SocialInboxAnalyticsBreakdown[]
}

function clampAnalyticsDays(days: number) {
  return Math.min(Math.max(Number(days) || 30, 1), 365)
}

function toNumber(value: number | string | null | undefined) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function nullablePct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : null
}

function labelFor(key: string) {
  const labels: Record<string, string> = {
    'comment': 'Comments',
    'dm': 'DMs',
    'mention': 'Mentions',
    'review': 'Reviews',
    'facebook': 'Facebook',
    'instagram': 'Instagram',
    'linkedin': 'LinkedIn',
    'tiktok': 'TikTok',
    'youtube': 'YouTube',
    'google-business': 'Google Business'
  }
  return labels[key] || key.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

export function buildSocialInboxAnalyticsSummaryQuery(input: SocialInboxAnalyticsInput): SocialInboxAnalyticsQuery {
  return {
    sql: `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
        COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::int AS responded,
        COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL)::int AS sla_tracked,
        COUNT(*) FILTER (WHERE sla_breached = TRUE)::int AS breaches,
        COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND (sla_due_at IS NULL OR first_response_at <= sla_due_at))::int AS within_sla,
        COUNT(*) FILTER (
          WHERE status <> 'closed'
            AND first_response_at IS NULL
            AND sla_due_at > NOW()
            AND sla_due_at <= NOW() + INTERVAL '24 hours'
        )::int AS due_soon,
        COUNT(*) FILTER (
          WHERE status <> 'closed'
            AND first_response_at IS NULL
            AND sla_due_at < NOW()
        )::int AS overdue_open,
        COUNT(*) FILTER (WHERE linked_task_id IS NOT NULL)::int AS linked_tasks,
        COUNT(*) FILTER (WHERE linked_client_request_id IS NOT NULL)::int AS linked_client_requests,
        COUNT(*) FILTER (WHERE linked_task_id IS NOT NULL OR linked_client_request_id IS NOT NULL)::int AS converted,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60.0) FILTER (WHERE first_response_at IS NOT NULL))::int, 0) AS avg_first_response_minutes
      FROM social_conversations
      WHERE client_id = $1 AND created_at > NOW() - MAKE_INTERVAL(days => $2)`,
    params: [input.clientId, clampAnalyticsDays(input.days)]
  }
}

export function buildSocialInboxAnalyticsBreakdownQuery(input: SocialInboxAnalyticsInput, dimension: SocialInboxAnalyticsDimension): SocialInboxAnalyticsQuery {
  return {
    sql: `
      SELECT
        ${dimension} AS key,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
        COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::int AS responded,
        COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL)::int AS sla_tracked,
        COUNT(*) FILTER (WHERE sla_breached = TRUE)::int AS breaches,
        COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND (sla_due_at IS NULL OR first_response_at <= sla_due_at))::int AS within_sla,
        COUNT(*) FILTER (WHERE linked_task_id IS NOT NULL OR linked_client_request_id IS NOT NULL)::int AS converted,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60.0) FILTER (WHERE first_response_at IS NOT NULL))::int, 0) AS avg_first_response_minutes
      FROM social_conversations
      WHERE client_id = $1 AND created_at > NOW() - MAKE_INTERVAL(days => $2)
      GROUP BY ${dimension}
      ORDER BY total DESC, key ASC`,
    params: [input.clientId, clampAnalyticsDays(input.days)]
  }
}

function mapBreakdownRows(rows: SocialInboxAnalyticsBreakdownRow[]): SocialInboxAnalyticsBreakdown[] {
  return rows.map((row) => {
    const total = toNumber(row.total)
    const slaTracked = toNumber(row.sla_tracked)
    const converted = toNumber(row.converted)
    const key = row.key || 'unknown'
    return {
      key,
      label: labelFor(key),
      total,
      open: toNumber(row.open_count),
      responded: toNumber(row.responded),
      avgFirstResponseMinutes: toNumber(row.avg_first_response_minutes),
      slaTracked,
      breaches: toNumber(row.breaches),
      withinSlaPct: nullablePct(toNumber(row.within_sla), slaTracked),
      converted,
      conversionRatePct: pct(converted, total)
    }
  })
}

export function mapSocialInboxAnalytics(
  summaryRow: SocialInboxAnalyticsSummaryRow | null | undefined,
  automationRow: SocialInboxAutomationRow | null | undefined,
  channelRows: SocialInboxAnalyticsBreakdownRow[],
  platformRows: SocialInboxAnalyticsBreakdownRow[]
): SocialInboxAnalyticsResult {
  const total = toNumber(summaryRow?.total)
  const responded = toNumber(summaryRow?.responded)
  const slaTracked = toNumber(summaryRow?.sla_tracked)
  const converted = toNumber(summaryRow?.converted)
  const sent = toNumber(automationRow?.sent)

  return {
    total,
    open: toNumber(summaryRow?.open_count),
    closed: toNumber(summaryRow?.closed_count),
    responded,
    responseRatePct: pct(responded, total),
    avgFirstResponseMinutes: toNumber(summaryRow?.avg_first_response_minutes),
    slaTracked,
    breaches: toNumber(summaryRow?.breaches),
    dueSoon: toNumber(summaryRow?.due_soon),
    overdueOpen: toNumber(summaryRow?.overdue_open),
    withinSlaPct: nullablePct(toNumber(summaryRow?.within_sla), slaTracked),
    linkedTasks: toNumber(summaryRow?.linked_tasks),
    linkedClientRequests: toNumber(summaryRow?.linked_client_requests),
    converted,
    conversionRatePct: pct(converted, total),
    automationRatePct: pct(toNumber(automationRow?.auto), sent),
    byChannel: mapBreakdownRows(channelRows),
    byPlatform: mapBreakdownRows(platformRows)
  }
}

export async function getSocialInboxAnalytics(db: SocialInboxAnalyticsDb, input: SocialInboxAnalyticsInput): Promise<SocialInboxAnalyticsResult> {
  const summaryQuery = buildSocialInboxAnalyticsSummaryQuery(input)
  const channelQuery = buildSocialInboxAnalyticsBreakdownQuery(input, 'channel_type')
  const platformQuery = buildSocialInboxAnalyticsBreakdownQuery(input, 'platform')
  const automationParams: [string, number] = [input.clientId, clampAnalyticsDays(input.days)]

  const [summary, automation, byChannel, byPlatform] = await Promise.all([
    db.queryOne<SocialInboxAnalyticsSummaryRow>(summaryQuery.sql, summaryQuery.params),
    db.queryOne<SocialInboxAutomationRow>(
      `SELECT
         COUNT(*) FILTER (WHERE effective_mode = 'autopilot' AND status = 'sent')::int AS auto,
         COUNT(*)::int AS sent
       FROM social_response_queue
       WHERE client_id = $1 AND created_at > NOW() - MAKE_INTERVAL(days => $2)`,
      automationParams
    ).catch(() => ({ auto: 0, sent: 0 })),
    db.queryRows<SocialInboxAnalyticsBreakdownRow>(channelQuery.sql, channelQuery.params),
    db.queryRows<SocialInboxAnalyticsBreakdownRow>(platformQuery.sql, platformQuery.params)
  ])

  return mapSocialInboxAnalytics(summary, automation, byChannel, byPlatform)
}
