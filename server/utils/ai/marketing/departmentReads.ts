import { createError } from 'h3'
import { queryOneFresh, queryRowsFresh } from '~~/server/utils/db'
import type { ToolContext } from '../toolContext'
import {
  DEPARTMENT_PORTFOLIO_CAP,
  DEPARTMENT_STALE_HOURS,
  clampLimit,
  clientPageCte,
  countScopedClients,
  counts,
  currentPeriod,
  daysInPeriod,
  decodeClientCursor,
  decodeOffsetCursor,
  departmentMeta,
  encodeOffsetCursor,
  finishClientPage,
  int,
  iso,
  isStale,
  localDate,
  narrowScope,
  num,
  ratio,
  resolveDepartmentReadScope,
  scopedClientsCte,
  windowStartDate,
  type DepartmentReadDeps,
  type DepartmentReadScope
} from './departmentReadSupport'

/**
 * Marketing department reporting over STORED records only. Every query starts from the authorised
 * ACTIVE client set (`scoped`), pages it by (name, id), and aggregates through LATERAL subqueries
 * keyed to the page client. Nothing here syncs providers, calls internal routes, or reads finance,
 * commission, payroll, raw lead field data, message bodies or recipient addresses.
 */

export type PageArgs = { cursor?: string, limit?: number, clientId?: string }
// Stored-row projections are validated field-by-field by int/num/iso/counts below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

type Prepared = { scope: DepartmentReadScope, now: Date, limit: number, total: number }
async function prepare(ctx: ToolContext, args: PageArgs, deps: DepartmentReadDeps): Promise<Prepared> {
  const scope = narrowScope(await resolveDepartmentReadScope(ctx, deps), args.clientId)
  const now = deps.now?.() ?? new Date()
  const limit = clampLimit(args.limit)
  decodeClientCursor(args.cursor)
  const total = await countScopedClients(scope, args.clientId)
  return { scope, now, limit, total }
}
/** Runs one labelled page query; `body` receives the params array AFTER scope/page params. */
async function pageQuery(prepared: Prepared, args: PageArgs, label: string, body: (params: unknown[]) => string): Promise<Row[]> {
  if (prepared.total === 0) return []
  const params: unknown[] = []
  const ctes = `${scopedClientsCte(prepared.scope, params)}, ${clientPageCte(params, decodeClientCursor(args.cursor), prepared.limit)}`
  const sql = body(params)
  return queryRowsFresh<Row>(`/* ${label} */ WITH ${ctes} ${sql}`, params)
}
function pageInfo(prepared: Prepared, page: { items: unknown[], hasMore: boolean, nextCursor: string | null }) {
  return { totalClients: prepared.total, limit: prepared.limit, returned: page.items.length, hasMore: page.hasMore, nextCursor: page.nextCursor }
}
/** Page rows may repeat a client (one row per platform/currency); group while preserving order. */
function groupByClient(rows: Row[]): Array<{ id: string, name: string, rows: Row[] }> {
  const groups: Array<{ id: string, name: string, rows: Row[] }> = []
  for (const row of rows) {
    const last = groups.at(-1)
    if (last && last.id === row.id) last.rows.push(row)
    else groups.push({ id: row.id, name: row.name, rows: [row] })
  }
  return groups
}
function finishGroupedPage(rows: Row[], limit: number) {
  return finishClientPage(groupByClient(rows), limit)
}

// ── Client inventory / coverage ───────────────────────────────────────────────────────────────

export async function readDepartmentClientInventory(ctx: ToolContext, args: PageArgs = {}, deps: DepartmentReadDeps = {}) {
  const prepared = await prepare(ctx, args, deps)
  const period = currentPeriod(prepared.now)
  const leadFrom = windowStartDate(prepared.now, 30)
  const emailFrom = windowStartDate(prepared.now, 90)
  let coverage: Row | null = null
  if (prepared.total > 0) {
    const params: unknown[] = []
    const scoped = scopedClientsCte(prepared.scope, params)
    params.push(period)
    const p = params.length
    coverage = await queryOneFresh<Row>(`/* dept:inventory:coverage */ WITH ${scoped}
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM media_spend ms WHERE ms.client_id = s.id AND ms.period = $${p}))::int AS with_spend,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM social_connections sc WHERE sc.client_id = s.id AND sc.status = 'active'))::int AS with_ad_connection,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lead_form_rules r WHERE r.client_id = s.id AND r.enabled))::int AS with_lead_rules,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM search_authority_sites sa WHERE sa.client_id = s.id AND sa.status = 'active'))::int AS with_search_site,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM social_conversations cv WHERE cv.client_id = s.id))::int AS with_social_inbox,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM campaigns em WHERE em.client_id = s.id))::int AS with_email
      FROM scoped s`, params)
  }
  const rows = await pageQuery(prepared, args, 'dept:inventory:page', (params) => {
    params.push(period, `${leadFrom}T00:00:00`, `${emailFrom}T00:00:00`)
    const [p, lf, ef] = [params.length - 2, params.length - 1, params.length]
    return `SELECT p.id, p.name,
        spend.spend_rows, spend.spend_last_synced_at,
        conn.active_ad_connections, conn.inactive_ad_connections,
        rules.lead_rules_enabled, lead.leads_30d,
        site.status AS search_site_status, site.gsc_data_through,
        inbox.open_conversations, email.email_campaigns_90d,
        creative.banner_projects, work.open_tasks
      FROM page p
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS spend_rows, MAX(ms.synced_at) AS spend_last_synced_at
        FROM media_spend ms WHERE ms.client_id = p.id AND ms.period = $${p}) spend ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE sc.status = 'active')::int AS active_ad_connections,
          COUNT(*) FILTER (WHERE sc.status IS DISTINCT FROM 'active')::int AS inactive_ad_connections
        FROM social_connections sc WHERE sc.client_id = p.id) conn ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE r.enabled)::int AS lead_rules_enabled
        FROM lead_form_rules r WHERE r.client_id = p.id) rules ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS leads_30d FROM leads l
        WHERE l.client_id = p.id AND l.deleted_at IS NULL AND l.is_test = false
          AND l.submitted_at >= ($${lf}::timestamp AT TIME ZONE 'Australia/Melbourne')) lead ON TRUE
      LEFT JOIN LATERAL (SELECT sa.status, (SELECT MAX(pm.data_through_date) FROM search_console_property_maps pm
          WHERE pm.client_id = sa.client_id AND pm.site_id = sa.id)::text AS gsc_data_through
        FROM search_authority_sites sa WHERE sa.client_id = p.id LIMIT 1) site ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE cv.status = 'open')::int AS open_conversations
        FROM social_conversations cv WHERE cv.client_id = p.id) inbox ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS email_campaigns_90d FROM campaigns em
        WHERE em.client_id = p.id AND em.updated_at >= ($${ef}::timestamp AT TIME ZONE 'Australia/Melbourne')) email ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS banner_projects FROM banner_projects bp WHERE bp.client_id = p.id) creative ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS open_tasks FROM tasks t JOIN projects pj ON pj.id = t.project_id
        WHERE pj.client_id = p.id AND t.status_is_final = false AND t.parent_task_id IS NULL) work ON TRUE
      ORDER BY p.name, p.id`
  })
  const page = finishClientPage(rows as Array<Row & { id: string, name: string }>, prepared.limit)
  return {
    ...departmentMeta(prepared.now),
    period,
    coverage: {
      totalActiveClients: prepared.total,
      withCurrentSpend: int(coverage?.with_spend),
      withActiveAdConnection: int(coverage?.with_ad_connection),
      withLeadRouting: int(coverage?.with_lead_rules),
      withActiveSearchSite: int(coverage?.with_search_site),
      withSocialInbox: int(coverage?.with_social_inbox),
      withEmailCampaigns: int(coverage?.with_email)
    },
    page: pageInfo(prepared, page),
    clients: page.items.map((r) => {
      const spendLines = int(r.spend_rows)
      const activeConnections = int(r.active_ad_connections)
      const lastSyncedAt = iso(r.spend_last_synced_at)
      const paidStatus = spendLines > 0
        ? (isStale(lastSyncedAt, prepared.now) ? 'stale' : 'reporting')
        : activeConnections > 0 ? 'connected_no_spend' : 'not_configured'
      const enabledRules = int(r.lead_rules_enabled)
      const searchStatus = r.search_site_status ? String(r.search_site_status) : 'not_configured'
      const missing: string[] = []
      if (paidStatus === 'not_configured') missing.push('paid_media_not_configured')
      if (paidStatus === 'stale') missing.push('paid_media_stale')
      if (paidStatus === 'connected_no_spend') missing.push('paid_media_no_current_period_rows')
      if (int(r.inactive_ad_connections) > 0) missing.push('ad_connection_inactive')
      if (enabledRules === 0) missing.push('lead_routing_not_configured')
      if (searchStatus === 'not_configured') missing.push('search_not_configured')
      return {
        clientId: r.id,
        name: r.name,
        paidMedia: { status: paidStatus, spendLines, lastSyncedAt, activeConnections, inactiveConnections: int(r.inactive_ad_connections) },
        leads: { status: enabledRules > 0 ? 'routing_configured' : 'not_configured', enabledRules, leadsLast30Days: int(r.leads_30d) },
        search: { status: searchStatus, dataThrough: r.gsc_data_through ?? null },
        socialInbox: { openConversations: int(r.open_conversations) },
        email: { campaignsLast90Days: int(r.email_campaigns_90d) },
        creative: { bannerProjects: int(r.banner_projects) },
        work: { openTasks: int(r.open_tasks) },
        missing
      }
    })
  }
}

// ── Budget health / forecast ──────────────────────────────────────────────────────────────────

export type BudgetArgs = PageArgs & { period?: string, platform?: 'google_ads' | 'meta' | 'linkedin' | 'tiktok' | 'programmatic' | 'traditional' | 'other' }

function budgetLine(r: Row, period: string, now: Date) {
  const budget = num(r.budget) ?? 0
  const spend = num(r.spend) ?? 0
  const lineCount = int(r.line_count)
  const budgetedLineCount = int(r.budgeted_line_count)
  const lastSyncedAt = iso(r.last_synced_at)
  const oldestSyncedAt = iso(r.oldest_synced_at)
  const spendAsOf = r.spend_as_of ? String(r.spend_as_of).slice(0, 10) : null
  const days = daysInPeriod(period)
  const closed = period < currentPeriod(now)
  const stale = int(r.stale_line_count) > 0 || isStale(oldestSyncedAt ?? lastSyncedAt, now)
  const base = { platform: String(r.platform), currency: String(r.currency ?? 'unknown'), budget, spend, lineCount, budgetedLineCount, lastSyncedAt, oldestSyncedAt, spendAsOf, staleLineCount: int(r.stale_line_count) }
  if (stale) return { ...base, status: 'stale_data', pacing: null, forecast: null }
  if (budget <= 0) return { ...base, status: 'no_budget_set', pacing: null, forecast: null }
  if (budgetedLineCount < lineCount) return { ...base, status: 'partial_budget_coverage', pacing: null, forecast: null }
  let daysElapsed: number | null = null
  if (closed) daysElapsed = days
  else if (spendAsOf?.startsWith(period)) daysElapsed = Number(spendAsOf.slice(8, 10))
  const pacing = daysElapsed
    ? (() => {
        const expectedSpendToDate = Math.round((budget * daysElapsed / days) * 100) / 100
        const variance = Math.round((spend - expectedSpendToDate) * 100) / 100
        return { expectedSpendToDate, variance, variancePct: ratio(variance, expectedSpendToDate) }
      })()
    : null
  const forecast = closed
    ? { method: 'period_closed_actuals', projectedSpend: spend, forecastVariance: Math.round((spend - budget) * 100) / 100, daysElapsed: days, daysInPeriod: days }
    : daysElapsed
      ? (() => {
          const projectedSpend = Math.round((spend / daysElapsed * days) * 100) / 100
          return { method: 'linear_run_rate_to_spend_as_of', projectedSpend, forecastVariance: Math.round((projectedSpend - budget) * 100) / 100, daysElapsed, daysInPeriod: days }
        })()
      : null
  let status = 'pacing_unavailable'
  if (spend > budget) status = 'over_budget'
  else if (forecast && forecast.projectedSpend > budget) status = 'projected_over'
  else if (forecast && forecast.projectedSpend < budget * 0.9) status = 'projected_under'
  else if (forecast) status = 'on_track'
  return { ...base, status, pacing, forecast }
}

export async function readDepartmentBudgetHealth(ctx: ToolContext, args: BudgetArgs = {}, deps: DepartmentReadDeps = {}) {
  const prepared = await prepare(ctx, args, deps)
  const period = args.period ?? currentPeriod(prepared.now)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > currentPeriod(prepared.now)) throw createError({ statusCode: 400, statusMessage: 'Invalid reporting period' })
  const filters = (params: unknown[], alias: string) => {
    params.push(period)
    let sql = `${alias}.period = $${params.length}`
    if (args.platform) {
      params.push(args.platform)
      sql += ` AND ${alias}.platform = $${params.length}`
    }
    return sql
  }
  const currency = `COALESCE(NULLIF(sc.metadata->>'currency', ''), 'unknown')`
  const rows = await pageQuery(prepared, args, 'dept:budget:page', (params) => {
    const where = filters(params, 'ms')
    params.push(prepared.now.toISOString(), DEPARTMENT_STALE_HOURS)
    const [nowRef, hoursRef] = [params.length - 1, params.length]
    return `SELECT p.id, p.name, b.platform, b.currency, b.budget, b.spend, b.line_count, b.budgeted_line_count,
        b.last_synced_at, b.oldest_synced_at, b.spend_as_of, b.stale_line_count
      FROM page p
      LEFT JOIN LATERAL (
        SELECT ms.platform, ${currency} AS currency,
          SUM(ms.budget_allocated)::float8 AS budget, SUM(COALESCE(ms.actual_spend, 0))::float8 AS spend,
          COUNT(*)::int AS line_count, COUNT(*) FILTER (WHERE ms.budget_allocated > 0)::int AS budgeted_line_count,
          MAX(ms.synced_at) AS last_synced_at, MIN(ms.synced_at) AS oldest_synced_at,
          MAX(ds.spend_as_of)::text AS spend_as_of,
          COUNT(*) FILTER (WHERE ms.synced_at IS NULL OR ms.synced_at < $${nowRef}::timestamptz - MAKE_INTERVAL(hours => $${hoursRef}))::int AS stale_line_count
        FROM media_spend ms
        LEFT JOIN social_connections sc ON sc.id = ms.connection_id
        LEFT JOIN LATERAL (SELECT MAX(d.spend_date) AS spend_as_of FROM daily_spend d WHERE d.media_spend_id = ms.id) ds ON TRUE
        WHERE ms.client_id = p.id AND ${where}
        GROUP BY ms.platform, ${currency}
      ) b ON TRUE
      ORDER BY p.name, p.id, b.platform, b.currency`
  })
  let totals: Row[] = []
  if (prepared.total > 0) {
    const params: unknown[] = []
    const scoped = scopedClientsCte(prepared.scope, params)
    const where = filters(params, 'ms')
    totals = await queryRowsFresh<Row>(`/* dept:budget:totals */ WITH ${scoped}
      SELECT ${currency} AS currency, SUM(ms.budget_allocated)::float8 AS budget, SUM(COALESCE(ms.actual_spend, 0))::float8 AS spend,
        COUNT(DISTINCT ms.client_id)::int AS client_count
      FROM media_spend ms JOIN scoped s ON s.id = ms.client_id
      LEFT JOIN social_connections sc ON sc.id = ms.connection_id
      WHERE ${where}
      GROUP BY ${currency} ORDER BY ${currency}`, params)
  }
  const page = finishGroupedPage(rows, prepared.limit)
  return {
    ...departmentMeta(prepared.now),
    period,
    periodClosed: period < currentPeriod(prepared.now),
    platform: args.platform ?? 'all',
    planBasis: 'linear_calendar_month_no_time_phased_plan_stored',
    classification: {
      over_budget: 'stored spend exceeds allocated budget',
      projected_over: 'forecast period-end spend exceeds allocated budget',
      projected_under: 'forecast period-end spend below 90% of allocated budget (diagnostic threshold, not a client target)',
      on_track: 'forecast between 90% and 100% of allocated budget',
      stale_data: `a stored line is older than ${DEPARTMENT_STALE_HOURS}h or never synced; no pacing conclusion`,
      partial_budget_coverage: 'only some lines carry a budget; no pacing conclusion',
      no_budget_set: 'no allocated budget stored',
      no_spend_data: 'no stored spend lines for this client and period',
      pacing_unavailable: 'no daily spend date inside the period to derive elapsed days'
    },
    totalsByCurrency: totals.map(t => ({ currency: String(t.currency), budget: num(t.budget) ?? 0, spend: num(t.spend) ?? 0, clientCount: int(t.client_count) })),
    page: pageInfo(prepared, page),
    clients: page.items.map((group) => {
      const lines = group.rows.filter(r => r.platform != null).map(r => budgetLine(r, period, prepared.now))
      return { clientId: group.id, name: group.name, status: lines.length ? 'reporting' : 'no_spend_data', lines }
    })
  }
}

// ── Lead quality / routing health ─────────────────────────────────────────────────────────────

export type WindowArgs = PageArgs & { days?: '7d' | '30d' | '90d' }
function windowDays(days: string | undefined, fallback: number) {
  const n = days ? Number.parseInt(days, 10) : fallback
  return [7, 28, 30, 90].includes(n) ? n : fallback
}

export async function readDepartmentLeadQuality(ctx: ToolContext, args: WindowArgs = {}, deps: DepartmentReadDeps = {}) {
  const prepared = await prepare(ctx, args, deps)
  const days = windowDays(args.days, 30)
  const from = windowStartDate(prepared.now, days)
  const rows = await pageQuery(prepared, args, 'dept:leads:page', (params) => {
    params.push(`${from}T00:00:00`, prepared.now.toISOString())
    const [f, n] = [params.length - 1, params.length]
    const window = `($${f}::timestamp AT TIME ZONE 'Australia/Melbourne')`
    const lead = `l.client_id = p.id AND l.deleted_at IS NULL AND l.is_test = false AND l.submitted_at >= ${window}`
    return `SELECT p.id, p.name, lq.total, lq.new_count, lq.contacted, lq.qualified, lq.won, lq.lost, lq.spam,
        lq.uncontacted_over_24h, lq.last_lead_at, src.by_source,
        rt.rules_enabled, rt.rules_without_destination,
        dl.delivered, dl.failed, dl.pending_overdue, fd.failed_by_type
      FROM page p
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE l.status = 'new')::int AS new_count,
          COUNT(*) FILTER (WHERE l.status = 'contacted')::int AS contacted,
          COUNT(*) FILTER (WHERE l.status = 'qualified')::int AS qualified,
          COUNT(*) FILTER (WHERE l.status = 'won')::int AS won,
          COUNT(*) FILTER (WHERE l.status = 'lost')::int AS lost,
          COUNT(*) FILTER (WHERE l.status = 'spam_suspected')::int AS spam,
          COUNT(*) FILTER (WHERE l.status = 'new' AND l.contacted_at IS NULL AND l.submitted_at < $${n}::timestamptz - INTERVAL '24 hours')::int AS uncontacted_over_24h,
          MAX(l.submitted_at) AS last_lead_at
        FROM leads l WHERE ${lead}) lq ON TRUE
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(x.source, x.n) AS by_source
        FROM (SELECT l.source, COUNT(*)::int AS n FROM leads l WHERE ${lead} GROUP BY l.source) x) src ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE r.enabled)::int AS rules_enabled,
          COUNT(*) FILTER (WHERE r.enabled AND NOT EXISTS (SELECT 1 FROM lead_rule_destinations d WHERE d.rule_id = r.id AND d.enabled))::int AS rules_without_destination
        FROM lead_form_rules r WHERE r.client_id = p.id) rt ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE ld.status = 'delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE ld.status = 'failed')::int AS failed,
          COUNT(*) FILTER (WHERE ld.status IN ('pending', 'claimed') AND ld.scheduled_at < $${n}::timestamptz - INTERVAL '1 hour')::int AS pending_overdue
        FROM lead_deliveries ld JOIN leads l ON l.id = ld.lead_id WHERE ${lead}) dl ON TRUE
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(x.destination_type, x.n) AS failed_by_type
        FROM (SELECT ld.destination_type, COUNT(*)::int AS n FROM lead_deliveries ld JOIN leads l ON l.id = ld.lead_id
          WHERE ${lead} AND ld.status = 'failed' GROUP BY ld.destination_type) x) fd ON TRUE
      ORDER BY p.name, p.id`
  })
  const page = finishClientPage(rows as Array<Row & { id: string, name: string }>, prepared.limit)
  return {
    ...departmentMeta(prepared.now),
    window: { days, from, to: localDate(prepared.now) },
    qualificationDefinition: 'Lead inbox status qualified or won as recorded by staff; no client-agreed qualification rule is stored. Test and deleted leads excluded.',
    page: pageInfo(prepared, page),
    clients: page.items.map((r) => {
      const total = int(r.total)
      const spam = int(r.spam)
      const qualified = int(r.qualified) + int(r.won)
      const enabledRules = int(r.rules_enabled)
      const failed = int(r.failed)
      const pendingOverdue = int(r.pending_overdue)
      const routingStatus = enabledRules === 0
        ? 'not_configured'
        : failed > 0 || pendingOverdue > 0
          ? 'failing'
          : int(r.rules_without_destination) > 0 ? 'degraded' : 'healthy'
      return {
        clientId: r.id,
        name: r.name,
        leads: {
          total,
          byStatus: { new: int(r.new_count), contacted: int(r.contacted), qualified: int(r.qualified), won: int(r.won), lost: int(r.lost), spam_suspected: spam },
          bySource: counts(r.by_source),
          qualified,
          qualifiedRate: ratio(qualified, total - spam),
          spamRate: ratio(spam, total),
          uncontactedOver24h: int(r.uncontacted_over_24h),
          lastLeadAt: iso(r.last_lead_at)
        },
        routing: {
          status: routingStatus,
          enabledRules,
          rulesWithoutDestination: int(r.rules_without_destination),
          deliveries: { delivered: int(r.delivered), failed, pendingOverdue },
          failedByDestination: counts(r.failed_by_type)
        },
        costPerQualifiedLead: { status: 'unavailable', reason: 'No client-agreed qualification rule or eligible media-cost mapping is stored.' }
      }
    })
  }
}

// ── SEO / opportunities / content ────────────────────────────────────────────────────────────

export type SeoArgs = PageArgs & { days?: '7d' | '28d' | '90d' }

export async function readDepartmentSeoOverview(ctx: ToolContext, args: SeoArgs = {}, deps: DepartmentReadDeps = {}) {
  const prepared = await prepare(ctx, args, deps)
  const days = windowDays(args.days, 28)
  const from = windowStartDate(prepared.now, days)
  const rows = await pageQuery(prepared, args, 'dept:seo:page', (params) => {
    params.push(from)
    const f = params.length
    return `SELECT p.id, p.name, sa.status AS site_status, sa.canonical_hostname AS hostname,
        pm.property_count, pm.data_through, pm.last_sync_status, pm.last_sync_completed_at,
        perf.property_perf, opp.open_opportunities, top.top_opportunities, content.content_by_status
      FROM page p
      LEFT JOIN search_authority_sites sa ON sa.client_id = p.id
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS property_count, MAX(m.data_through_date)::text AS data_through,
          (ARRAY_AGG(m.last_sync_status ORDER BY m.last_sync_completed_at DESC NULLS LAST))[1] AS last_sync_status,
          MAX(m.last_sync_completed_at) AS last_sync_completed_at
        FROM search_console_property_maps m WHERE m.client_id = p.id AND m.status IN ('active', 'restricted')) pm ON TRUE
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('propertyMapId', x.property_map_id, 'clicks', x.clicks, 'impressions', x.impressions,
            'weightedPosition', x.weighted_position, 'daysWithData', x.days_with_data, 'provisionalDays', x.provisional_days) ORDER BY x.property_map_id) AS property_perf
        FROM (SELECT g.property_map_id, SUM(g.clicks)::float8 AS clicks, SUM(g.impressions)::float8 AS impressions,
            (SUM(g.position * g.impressions) / NULLIF(SUM(g.impressions), 0))::float8 AS weighted_position,
            COUNT(DISTINCT g.metric_date)::int AS days_with_data,
            COUNT(DISTINCT g.metric_date) FILTER (WHERE g.provisional)::int AS provisional_days
          FROM gsc_daily_property g WHERE g.client_id = p.id AND g.search_type = 'web' AND g.metric_date >= $${f}::date
          GROUP BY g.property_map_id) x) perf ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS open_opportunities FROM search_authority_opportunities o
        WHERE o.client_id = p.id AND o.lifecycle_status IN ('new', 'under_review', 'accepted', 'task_created', 'in_progress')) opp ON TRUE
      LEFT JOIN LATERAL (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'type', t.opportunity_type, 'title', t.title, 'score', t.score,
            'status', t.lifecycle_status, 'pageUrl', t.page_url, 'lastDetectedAt', t.last_detected_at) ORDER BY t.score DESC, t.id), '[]'::jsonb) AS top_opportunities
        FROM (SELECT o.id, o.opportunity_type, o.title, o.score, o.lifecycle_status, o.page_url, o.last_detected_at
          FROM search_authority_opportunities o WHERE o.client_id = p.id AND o.lifecycle_status IN ('new', 'under_review', 'accepted')
          ORDER BY o.score DESC, o.id LIMIT 3) t) top ON TRUE
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(x.status, x.n) AS content_by_status
        FROM (SELECT a.status, COUNT(*)::int AS n FROM search_authority_content_assets a WHERE a.client_id = p.id GROUP BY a.status) x) content ON TRUE
      ORDER BY p.name, p.id`
  })
  const page = finishClientPage(rows as Array<Row & { id: string, name: string }>, prepared.limit)
  return {
    ...departmentMeta(prepared.now),
    window: { days, from, to: localDate(prepared.now), searchType: 'web' },
    metricNotes: {
      ctr: 'clicks ÷ impressions from stored totals for one property',
      position: 'impression-weighted average position; diagnostic, not a revenue outcome',
      properties: 'multiple Search Console properties can overlap (domain vs URL-prefix) so they are listed, never summed'
    },
    page: pageInfo(prepared, page),
    clients: page.items.map((r) => {
      const perProperty = (Array.isArray(r.property_perf) ? r.property_perf : []).map((x: Row) => ({
        propertyMapId: String(x.propertyMapId), clicks: num(x.clicks) ?? 0, impressions: num(x.impressions) ?? 0,
        ctr: ratio(num(x.clicks), num(x.impressions)), weightedPosition: num(x.weightedPosition),
        daysWithData: int(x.daysWithData), provisionalDays: int(x.provisionalDays)
      }))
      const propertyCount = int(r.property_count)
      const lastSyncAt = iso(r.last_sync_completed_at)
      let status = 'reporting'
      if (!r.site_status) status = 'not_configured'
      else if (propertyCount === 0) status = 'no_search_console_property'
      else if (r.last_sync_status === 'failed') status = 'sync_failed'
      else if (isStale(lastSyncAt, prepared.now)) status = 'stale'
      else if (!perProperty.length) status = 'no_metrics_in_window'
      const single = perProperty.length === 1
      return {
        clientId: r.id,
        name: r.name,
        status,
        site: r.site_status ? { status: String(r.site_status), hostname: r.hostname ?? null } : null,
        properties: propertyCount,
        dataThrough: r.data_through ?? null,
        lastSync: { status: r.last_sync_status ?? null, completedAt: lastSyncAt },
        performanceBasis: perProperty.length === 0 ? 'no_stored_metrics' : single ? 'single_property' : 'multiple_properties_not_summed',
        performance: single ? perProperty[0] : null,
        ...(perProperty.length > 1 ? { perProperty } : {}),
        opportunities: {
          open: int(r.open_opportunities),
          top: (Array.isArray(r.top_opportunities) ? r.top_opportunities : []).map((o: Row) => ({
            id: o.id, type: o.type, title: o.title, score: int(o.score), status: o.status, pageUrl: o.pageUrl ?? null, lastDetectedAt: iso(o.lastDetectedAt)
          }))
        },
        content: { byStatus: counts(r.content_by_status) }
      }
    })
  }
}

// ── Social inbox / email statistics ───────────────────────────────────────────────────────────

export async function readDepartmentInboxEmailStats(ctx: ToolContext, args: WindowArgs = {}, deps: DepartmentReadDeps = {}) {
  const prepared = await prepare(ctx, args, deps)
  const days = windowDays(args.days, 30)
  const from = windowStartDate(prepared.now, days)
  const rows = await pageQuery(prepared, args, 'dept:inbox:page', (params) => {
    params.push(`${from}T00:00:00`)
    const window = `($${params.length}::timestamp AT TIME ZONE 'Australia/Melbourne')`
    return `SELECT p.id, p.name, ib.conversations, ib.open_count, ib.open_breached, ib.awaiting_reply, ib.oldest_awaiting_at,
        ib.created_in_window, ib.responded_in_window, ib.avg_first_response_minutes, ib.last_message_at,
        em.campaigns, em.sent_campaigns, em.in_flight, em.drafts, em.sent, em.delivered, em.opened, em.clicked,
        em.bounced, em.complained, em.unsubscribed, em.last_finished_at
      FROM page p
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS conversations,
          COUNT(*) FILTER (WHERE c.status = 'open')::int AS open_count,
          COUNT(*) FILTER (WHERE c.status = 'open' AND c.sla_breached)::int AS open_breached,
          COUNT(*) FILTER (WHERE c.status = 'open' AND c.last_message_direction = 'in')::int AS awaiting_reply,
          MIN(c.last_message_at) FILTER (WHERE c.status = 'open' AND c.last_message_direction = 'in') AS oldest_awaiting_at,
          COUNT(*) FILTER (WHERE c.created_at >= ${window})::int AS created_in_window,
          COUNT(*) FILTER (WHERE c.created_at >= ${window} AND c.first_response_at IS NOT NULL)::int AS responded_in_window,
          (AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) / 60)
            FILTER (WHERE c.created_at >= ${window} AND c.first_response_at IS NOT NULL))::float8 AS avg_first_response_minutes,
          MAX(c.last_message_at) AS last_message_at
        FROM social_conversations c WHERE c.client_id = p.id) ib ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS campaigns,
          COUNT(*) FILTER (WHERE e.status = 'sent' AND e.finished_at >= ${window})::int AS sent_campaigns,
          COUNT(*) FILTER (WHERE e.status IN ('scheduled', 'sending', 'paused'))::int AS in_flight,
          COUNT(*) FILTER (WHERE e.status = 'draft')::int AS drafts,
          COALESCE(SUM(e.sent) FILTER (WHERE e.status = 'sent' AND e.finished_at >= ${window}), 0)::int AS sent,
          COALESCE(SUM(e.delivered) FILTER (WHERE e.status = 'sent' AND e.finished_at >= ${window}), 0)::int AS delivered,
          COALESCE(SUM(e.opened) FILTER (WHERE e.status = 'sent' AND e.finished_at >= ${window}), 0)::int AS opened,
          COALESCE(SUM(e.clicked) FILTER (WHERE e.status = 'sent' AND e.finished_at >= ${window}), 0)::int AS clicked,
          COALESCE(SUM(e.bounced) FILTER (WHERE e.status = 'sent' AND e.finished_at >= ${window}), 0)::int AS bounced,
          COALESCE(SUM(e.complained) FILTER (WHERE e.status = 'sent' AND e.finished_at >= ${window}), 0)::int AS complained,
          COALESCE(SUM(e.unsubscribed) FILTER (WHERE e.status = 'sent' AND e.finished_at >= ${window}), 0)::int AS unsubscribed,
          MAX(e.finished_at) AS last_finished_at
        FROM campaigns e WHERE e.client_id = p.id AND e.status <> 'cancelled') em ON TRUE
      ORDER BY p.name, p.id`
  })
  const page = finishClientPage(rows as Array<Row & { id: string, name: string }>, prepared.limit)
  return {
    ...departmentMeta(prepared.now),
    window: { days, from, to: localDate(prepared.now) },
    metricNotes: {
      firstResponse: 'first_response_at minus conversation creation (ingestion) time, for conversations created in the window; no service-hours calendar applied',
      emailRates: 'delivery and bounce divide by sent; click, complaint and unsubscribe divide by delivered; totals over campaigns sent in the window',
      opens: 'opens are reported as stored counts only; an open is not a business outcome'
    },
    page: pageInfo(prepared, page),
    clients: page.items.map((r) => {
      const sent = int(r.sent)
      const delivered = int(r.delivered)
      return {
        clientId: r.id,
        name: r.name,
        socialInbox: {
          status: int(r.conversations) > 0 ? 'reporting' : 'not_configured',
          open: int(r.open_count),
          openSlaBreached: int(r.open_breached),
          awaitingReply: int(r.awaiting_reply),
          oldestAwaitingSince: iso(r.oldest_awaiting_at),
          createdInWindow: int(r.created_in_window),
          respondedInWindow: int(r.responded_in_window),
          avgFirstResponseMinutes: num(r.avg_first_response_minutes),
          lastMessageAt: iso(r.last_message_at)
        },
        email: {
          status: int(r.campaigns) === 0 ? 'not_configured' : int(r.sent_campaigns) > 0 ? 'reporting' : 'no_sends_in_window',
          sentCampaigns: int(r.sent_campaigns),
          inFlight: int(r.in_flight),
          drafts: int(r.drafts),
          totals: { sent, delivered, opened: int(r.opened), clicked: int(r.clicked), bounced: int(r.bounced), complained: int(r.complained), unsubscribed: int(r.unsubscribed) },
          rates: {
            delivery: ratio(delivered, sent),
            bounce: ratio(int(r.bounced), sent),
            click: ratio(int(r.clicked), delivered),
            complaint: ratio(int(r.complained), delivered),
            unsubscribe: ratio(int(r.unsubscribed), delivered)
          },
          lastFinishedAt: iso(r.last_finished_at)
        }
      }
    })
  }
}

// ── Creative asset inventory ──────────────────────────────────────────────────────────────────

export async function readDepartmentCreativeInventory(ctx: ToolContext, args: PageArgs = {}, deps: DepartmentReadDeps = {}) {
  const prepared = await prepare(ctx, args, deps)
  const today = localDate(prepared.now)
  const rows = await pageQuery(prepared, args, 'dept:creative:page', (params) => {
    params.push(today)
    const t = params.length
    return `SELECT p.id, p.name, bp.banner_projects, bp.banner_in_review, bp.banner_last_updated_at, bs.banner_by_status,
        va.video_assets, va.video_last_created_at, bk.brand_kits, pr.open_proofs, pr.overdue_proofs, ps.proof_by_status
      FROM page p
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS banner_projects, COUNT(*) FILTER (WHERE b.review_status = 'in_review')::int AS banner_in_review,
          MAX(b.updated_at) AS banner_last_updated_at
        FROM banner_projects b WHERE b.client_id = p.id) bp ON TRUE
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(x.status, x.n) AS banner_by_status
        FROM (SELECT COALESCE(b.status, 'unknown') AS status, COUNT(*)::int AS n FROM banner_projects b WHERE b.client_id = p.id GROUP BY 1) x) bs ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS video_assets, MAX(v.created_at) AS video_last_created_at
        FROM video_assets v WHERE v.client_id = p.id) va ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS brand_kits FROM brand_kits k WHERE k.client_id = p.id) bk ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE cp.status NOT IN ('approved', 'rejected', 'archived'))::int AS open_proofs,
          COUNT(*) FILTER (WHERE cp.status NOT IN ('approved', 'rejected', 'archived') AND cp.due_date < $${t}::date)::int AS overdue_proofs
        FROM creative_proofs cp JOIN projects pj ON pj.id = cp.project_id WHERE pj.client_id = p.id) pr ON TRUE
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(x.status, x.n) AS proof_by_status
        FROM (SELECT COALESCE(cp.status, 'unknown') AS status, COUNT(*)::int AS n FROM creative_proofs cp JOIN projects pj ON pj.id = cp.project_id
          WHERE pj.client_id = p.id GROUP BY 1) x) ps ON TRUE
      ORDER BY p.name, p.id`
  })
  const page = finishClientPage(rows as Array<Row & { id: string, name: string }>, prepared.limit)
  return {
    ...departmentMeta(prepared.now),
    today,
    page: pageInfo(prepared, page),
    clients: page.items.map(r => ({
      clientId: r.id,
      name: r.name,
      banners: { total: int(r.banner_projects), inReview: int(r.banner_in_review), byStatus: counts(r.banner_by_status), lastUpdatedAt: iso(r.banner_last_updated_at) },
      video: { assets: int(r.video_assets), lastCreatedAt: iso(r.video_last_created_at) },
      brandKits: int(r.brand_kits),
      proofs: { open: int(r.open_proofs), overdue: int(r.overdue_proofs), byStatus: counts(r.proof_by_status) }
    }))
  }
}

// ── Department work coverage (tasks / briefs) ────────────────────────────────────────────────

export type WorkArgs = PageArgs & { dueWithinDays?: number }
const WORKLOAD_LIMIT = 25

export async function readDepartmentWorkCoverage(ctx: ToolContext, args: WorkArgs = {}, deps: DepartmentReadDeps = {}) {
  const prepared = await prepare(ctx, args, deps)
  const today = localDate(prepared.now)
  const dueWithinDays = Math.min(Math.max(Number.isInteger(args.dueWithinDays) ? Number(args.dueWithinDays) : 7, 1), 31)
  const openTask = `t.status_is_final = false AND t.parent_task_id IS NULL`
  const openBrief = `b.status NOT IN ('completed', 'cancelled', 'rejected')`
  const rows = await pageQuery(prepared, args, 'dept:work:page', (params) => {
    params.push(today, dueWithinDays)
    const [t, d] = [params.length - 1, params.length]
    return `SELECT p.id, p.name, tk.open_tasks, tk.overdue_tasks, tk.blocked_tasks, tk.unassigned_open, tk.due_soon, tk.oldest_overdue_due,
        br.open_briefs, br.briefs_awaiting_review, br.briefs_past_deadline, br.unassigned_open_briefs, bs.brief_by_status
      FROM page p
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS open_tasks,
          COUNT(*) FILTER (WHERE t.due_date < $${t}::date)::int AS overdue_tasks,
          COUNT(*) FILTER (WHERE t.is_blocked)::int AS blocked_tasks,
          COUNT(*) FILTER (WHERE t.assignee_id IS NULL)::int AS unassigned_open,
          COUNT(*) FILTER (WHERE t.due_date >= $${t}::date AND t.due_date < $${t}::date + $${d}::int)::int AS due_soon,
          MIN(t.due_date) FILTER (WHERE t.due_date < $${t}::date)::text AS oldest_overdue_due
        FROM tasks t JOIN projects pj ON pj.id = t.project_id WHERE pj.client_id = p.id AND ${openTask}) tk ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE ${openBrief})::int AS open_briefs,
          COUNT(*) FILTER (WHERE b.status IN ('submitted', 'under_review'))::int AS briefs_awaiting_review,
          COUNT(*) FILTER (WHERE ${openBrief} AND b.requested_deadline < $${t}::date)::int AS briefs_past_deadline,
          COUNT(*) FILTER (WHERE ${openBrief} AND b.status <> 'draft' AND b.assigned_to IS NULL)::int AS unassigned_open_briefs
        FROM briefs b WHERE b.client_id = p.id) br ON TRUE
      LEFT JOIN LATERAL (SELECT jsonb_object_agg(x.status, x.n) AS brief_by_status
        FROM (SELECT COALESCE(b.status, 'unknown') AS status, COUNT(*)::int AS n FROM briefs b WHERE b.client_id = p.id GROUP BY 1) x) bs ON TRUE
      ORDER BY p.name, p.id`
  })
  let workload: Row[] = []
  if (prepared.total > 0) {
    const params: unknown[] = []
    const scoped = scopedClientsCte(prepared.scope, params)
    params.push(today, WORKLOAD_LIMIT + 1)
    workload = await queryRowsFresh<Row>(`/* dept:work:assignees */ WITH ${scoped}
      SELECT t.assignee_id::text AS assignee_id, tm.name AS assignee_name, COUNT(*)::int AS open_tasks,
        COUNT(*) FILTER (WHERE t.due_date < $${params.length - 1}::date)::int AS overdue_tasks,
        COUNT(DISTINCT pj.client_id)::int AS client_count
      FROM tasks t JOIN projects pj ON pj.id = t.project_id JOIN scoped s ON s.id = pj.client_id
      LEFT JOIN team_members tm ON tm.id = t.assignee_id
      WHERE ${openTask}
      GROUP BY t.assignee_id, tm.name
      ORDER BY open_tasks DESC, t.assignee_id NULLS FIRST
      LIMIT $${params.length}`, params)
  }
  const page = finishClientPage(rows as Array<Row & { id: string, name: string }>, prepared.limit)
  return {
    ...departmentMeta(prepared.now),
    today,
    dueWithinDays,
    definitions: {
      openTask: 'top-level task on a project of the client whose status is not final',
      openBrief: 'brief not completed, cancelled or rejected',
      awaitingReview: 'brief status submitted or under_review'
    },
    page: pageInfo(prepared, page),
    clients: page.items.map(r => ({
      clientId: r.id,
      name: r.name,
      tasks: { open: int(r.open_tasks), overdue: int(r.overdue_tasks), blocked: int(r.blocked_tasks), unassigned: int(r.unassigned_open), dueSoon: int(r.due_soon), oldestOverdueDue: r.oldest_overdue_due ?? null },
      briefs: { open: int(r.open_briefs), awaitingReview: int(r.briefs_awaiting_review), pastDeadline: int(r.briefs_past_deadline), unassigned: int(r.unassigned_open_briefs), byStatus: counts(r.brief_by_status) }
    })),
    workload: {
      scope: 'open top-level tasks across every client in scope',
      assignees: workload.slice(0, WORKLOAD_LIMIT).map(w => ({
        assigneeId: w.assignee_id ?? null,
        name: w.assignee_id ? (w.assignee_name ?? 'Unknown team member') : 'Unassigned',
        openTasks: int(w.open_tasks),
        overdueTasks: int(w.overdue_tasks),
        clientCount: int(w.client_count)
      })),
      hasMore: workload.length > WORKLOAD_LIMIT
    }
  }
}

// ── Daily portfolio brief ─────────────────────────────────────────────────────────────────────

export type BriefArgs = { cursor?: string, limit?: number, clientId?: string, minSeverity?: 'high' | 'medium' | 'low' }
type Severity = 'high' | 'medium' | 'low'
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
type SignalSpec = { signal: string, severity: Severity, field: string, function: string, nextAction: string }
const SIGNALS: SignalSpec[] = [
  { signal: 'over_budget', severity: 'high', field: 'over_budget_lines', function: 'paid_media', nextAction: 'Review the over-budget spend lines with get_department_budget_health before proposing any change.' },
  { signal: 'lead_deliveries_failed', severity: 'high', field: 'failed_deliveries', function: 'measurement', nextAction: 'Inspect lead routing with get_department_lead_quality; failed deliveries were not received by their destination.' },
  { signal: 'lead_deliveries_pending_overdue', severity: 'high', field: 'pending_overdue_deliveries', function: 'measurement', nextAction: 'Lead deliveries are queued past their schedule; check the routing worker before retrying anything.' },
  { signal: 'social_sla_breached', severity: 'high', field: 'open_sla_breaches', function: 'content', nextAction: 'Triage breached open conversations in the social inbox.' },
  { signal: 'ad_connection_inactive', severity: 'medium', field: 'inactive_ad_connections', function: 'paid_media', nextAction: 'An ad-account connection is not active (for example expired, disconnected or errored); the authorised account holder must reconnect it.' },
  { signal: 'uncontacted_new_leads', severity: 'medium', field: 'uncontacted_new_leads', function: 'coordinator', nextAction: 'New leads older than 24h have no contact recorded; confirm the client follow-up owner.' },
  { signal: 'overdue_tasks', severity: 'medium', field: 'overdue_tasks', function: 'coordinator', nextAction: 'Review overdue client tasks with get_department_work_coverage.' },
  { signal: 'briefs_past_deadline', severity: 'medium', field: 'briefs_past_deadline', function: 'coordinator', nextAction: 'Open briefs are past their requested deadline; confirm ownership and revised dates.' },
  { signal: 'overdue_proofs', severity: 'medium', field: 'overdue_proofs', function: 'content', nextAction: 'Creative proofs are past due; check review status with get_department_creative_inventory.' },
  { signal: 'blocked_tasks', severity: 'low', field: 'blocked_tasks', function: 'coordinator', nextAction: 'Resolve the recorded blocker on these tasks.' },
  { signal: 'briefs_awaiting_review', severity: 'low', field: 'briefs_awaiting_review', function: 'department_head', nextAction: 'Briefs are waiting for review.' },
  { signal: 'search_sync_failed', severity: 'low', field: 'gsc_failed_properties', function: 'seo', nextAction: 'The last Search Console sync failed; SEO figures for this client are not current.' }
]

export async function readDepartmentDailyBrief(ctx: ToolContext, args: BriefArgs = {}, deps: DepartmentReadDeps = {}) {
  const scope = narrowScope(await resolveDepartmentReadScope(ctx, deps), args.clientId)
  const now = deps.now?.() ?? new Date()
  const limit = clampLimit(args.limit)
  const offset = decodeOffsetCursor(args.cursor)
  const total = await countScopedClients(scope, args.clientId)
  const period = currentPeriod(now)
  const today = localDate(now)
  const from = windowStartDate(now, 7)
  let rows: Row[] = []
  if (total > 0) {
    const params: unknown[] = []
    const scoped = scopedClientsCte(scope, params)
    params.push(period, today, `${from}T00:00:00`, now.toISOString(), DEPARTMENT_PORTFOLIO_CAP + 1)
    const [p, t, f, n, cap] = [params.length - 4, params.length - 3, params.length - 2, params.length - 1, params.length]
    const window = `($${f}::timestamp AT TIME ZONE 'Australia/Melbourne')`
    const lead = `l.client_id = s.id AND l.deleted_at IS NULL AND l.is_test = false`
    rows = await queryRowsFresh<Row>(`/* dept:brief:signals */ WITH ${scoped}
      SELECT s.id, s.name, sp.spend_lines, sp.over_budget_lines, sp.spend_oldest_synced_at, cn.inactive_ad_connections,
        ld.failed_deliveries, ld.pending_overdue_deliveries, lq.uncontacted_new_leads, ib.open_sla_breaches,
        tk.overdue_tasks, tk.blocked_tasks, bf.briefs_awaiting_review, bf.briefs_past_deadline, pf.overdue_proofs, gs.gsc_failed_properties
      FROM scoped s
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS spend_lines,
          COUNT(*) FILTER (WHERE ms.budget_allocated > 0 AND ms.actual_spend > ms.budget_allocated)::int AS over_budget_lines,
          MIN(ms.synced_at) AS spend_oldest_synced_at
        FROM media_spend ms WHERE ms.client_id = s.id AND ms.period = $${p}) sp ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE sc.status IS DISTINCT FROM 'active')::int AS inactive_ad_connections
        FROM social_connections sc WHERE sc.client_id = s.id) cn ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE ld.status = 'failed')::int AS failed_deliveries,
          COUNT(*) FILTER (WHERE ld.status IN ('pending', 'claimed') AND ld.scheduled_at < $${n}::timestamptz - INTERVAL '1 hour')::int AS pending_overdue_deliveries
        FROM lead_deliveries ld JOIN leads l ON l.id = ld.lead_id WHERE ${lead} AND ld.created_at >= ${window}) ld ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS uncontacted_new_leads FROM leads l
        WHERE ${lead} AND l.status = 'new' AND l.contacted_at IS NULL AND l.submitted_at >= ${window}
          AND l.submitted_at < $${n}::timestamptz - INTERVAL '24 hours') lq ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS open_sla_breaches FROM social_conversations c
        WHERE c.client_id = s.id AND c.status = 'open' AND c.sla_breached) ib ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE t.due_date < $${t}::date)::int AS overdue_tasks,
          COUNT(*) FILTER (WHERE t.is_blocked)::int AS blocked_tasks
        FROM tasks t JOIN projects pj ON pj.id = t.project_id
        WHERE pj.client_id = s.id AND t.status_is_final = false AND t.parent_task_id IS NULL) tk ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE b.status IN ('submitted', 'under_review'))::int AS briefs_awaiting_review,
          COUNT(*) FILTER (WHERE b.status NOT IN ('completed', 'cancelled', 'rejected') AND b.requested_deadline < $${t}::date)::int AS briefs_past_deadline
        FROM briefs b WHERE b.client_id = s.id) bf ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*)::int AS overdue_proofs FROM creative_proofs cp JOIN projects pj ON pj.id = cp.project_id
        WHERE pj.client_id = s.id AND cp.status NOT IN ('approved', 'rejected', 'archived') AND cp.due_date < $${t}::date) pf ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) FILTER (WHERE m.last_sync_status = 'failed')::int AS gsc_failed_properties
        FROM search_console_property_maps m WHERE m.client_id = s.id AND m.status IN ('active', 'restricted')) gs ON TRUE
      ORDER BY s.name, s.id
      LIMIT $${cap}`, params)
  }
  const evaluated = rows.slice(0, DEPARTMENT_PORTFOLIO_CAP)
  const minRank = SEVERITY_RANK[args.minSeverity ?? 'low']
  type Exception = { clientId: string, clientName: string, signal: string, severity: Severity, count: number, evidenceAsOf: string | null, function: string, owner: null, nextAction: string }
  const exceptions: Exception[] = []
  let withoutPaid = 0
  let stalePaid = 0
  for (const r of evaluated) {
    const spendLines = int(r.spend_lines)
    const syncedAt = iso(r.spend_oldest_synced_at)
    if (spendLines === 0) withoutPaid++
    const push = (spec: Omit<SignalSpec, 'field'>, count: number, evidenceAsOf: string | null) => {
      if (count > 0 && SEVERITY_RANK[spec.severity] <= minRank)
        exceptions.push({ clientId: r.id, clientName: r.name, signal: spec.signal, severity: spec.severity, count, evidenceAsOf, function: spec.function, owner: null, nextAction: spec.nextAction })
    }
    for (const spec of SIGNALS) push(spec, int(r[spec.field]), spec.field === 'over_budget_lines' ? syncedAt : now.toISOString())
    if (spendLines > 0 && isStale(syncedAt, now)) {
      stalePaid++
      push({ signal: 'paid_media_stale', severity: 'medium', function: 'paid_media', nextAction: `Stored spend is older than ${DEPARTMENT_STALE_HOURS}h; budget conclusions for this client are withheld until a sync succeeds.` }, spendLines, syncedAt)
    }
  }
  exceptions.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.clientName.localeCompare(b.clientName) || a.clientId.localeCompare(b.clientId) || a.signal.localeCompare(b.signal))
  const items = exceptions.slice(offset, offset + limit)
  const hasMore = offset + items.length < exceptions.length
  return {
    ...departmentMeta(now),
    period,
    today,
    leadWindow: { days: 7, from },
    coverage: {
      totalActiveClients: total,
      evaluatedClients: evaluated.length,
      complete: evaluated.length === total,
      clientsWithExceptions: new Set(exceptions.map(e => e.clientId)).size,
      clientsWithoutPaidMedia: withoutPaid,
      clientsWithStalePaidMedia: stalePaid
    },
    notes: 'Signals are counts from stored records; owner is null because no assignment is recorded for these exceptions. No outcome, KPI target or provider state is inferred.',
    page: { limit, total: exceptions.length, returned: items.length, hasMore, nextCursor: hasMore ? encodeOffsetCursor(offset + items.length) : null },
    exceptions: items
  }
}
