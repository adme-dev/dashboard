import { z } from 'zod'
import { queryOne as dbQueryOne, queryRows as dbQueryRows } from '~~/server/utils/db'
import type {
  AiMaxMigrationReason,
  AiMaxReadinessStatus
} from '~~/server/utils/googleAiMax'

export type GoogleAiMaxStaleFilter = 'fresh' | 'warning' | 'critical'

export interface GoogleAiMaxReadinessFilters {
  page: number
  pageSize: number
  status?: AiMaxReadinessStatus
  connectionId?: string
  clientId?: string
  campaignStatus?: string
  migrationReason?: AiMaxMigrationReason
  stale?: GoogleAiMaxStaleFilter
  changedSince?: string
  search?: string
}

const boundedInteger = (minimum: number, maximum: number, fallback: number) => z.preprocess(
  value => Array.isArray(value) ? Number.NaN : value,
  z.coerce.number().int().min(minimum).max(maximum).default(fallback)
)

const QuerySchema = z.object({
  page: boundedInteger(1, 100_000, 1),
  pageSize: boundedInteger(1, 100, 25),
  status: z.enum([
    'ready',
    'scheduled_upgrade',
    'needs_review',
    'not_affected',
    'unknown'
  ]).optional(),
  connectionId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  campaignStatus: z.string().trim().min(1).max(50).optional(),
  migrationReason: z.enum([
    'aca',
    'campaign_broad_match',
    'aca_and_campaign_broad_match',
    'none',
    'unknown'
  ]).optional(),
  stale: z.enum(['fresh', 'warning', 'critical']).optional(),
  changedSince: z.string().datetime({ offset: true }).optional(),
  search: z.string().trim().min(1).max(100).optional()
}).strict()

export function parseGoogleAiMaxReadinessQuery(
  query: Record<string, unknown>
): GoogleAiMaxReadinessFilters {
  const parsed = QuerySchema.safeParse(query)
  if (!parsed.success) throw new Error('Invalid AI Max readiness query')
  return {
    ...parsed.data,
    page: parsed.data.page ?? 1,
    pageSize: parsed.data.pageSize ?? 25
  }
}

type DatabaseRow = Record<string, unknown>

interface ReadinessQueryDependencies {
  queryOne<T extends DatabaseRow = DatabaseRow>(sql: string, params?: unknown[]): Promise<T | null>
  queryRows<T extends DatabaseRow = DatabaseRow>(sql: string, params?: unknown[]): Promise<T[]>
}

const defaultQueryDependencies: ReadinessQueryDependencies = {
  queryOne: dbQueryOne,
  queryRows: dbQueryRows
}

const EFFECTIVE_READINESS_SQL = `CASE
  WHEN s.last_observed_at < NOW() - INTERVAL '72 hours' THEN 'unknown'
  ELSE s.readiness_status
END`

const FRESHNESS_SQL = `CASE
  WHEN s.last_observed_at < NOW() - INTERVAL '72 hours' THEN 'critical'
  WHEN s.last_observed_at < NOW() - INTERVAL '26 hours' THEN 'warning'
  ELSE 'fresh'
END`

function addFilter(
  clauses: string[],
  params: unknown[],
  sql: (placeholder: string) => string,
  value: unknown
): void {
  params.push(value)
  clauses.push(sql(`$${params.length}`))
}

function readinessDataset(filters: GoogleAiMaxReadinessFilters, tenantId: string) {
  const params: unknown[] = [tenantId]
  const clauses = ['s.tenant_id = $1']

  if (filters.status) {
    addFilter(clauses, params, p => `(${EFFECTIVE_READINESS_SQL}) = ${p}`, filters.status)
  }
  if (filters.connectionId) {
    addFilter(clauses, params, p => `s.connection_id = ${p}`, filters.connectionId)
  }
  if (filters.clientId) {
    addFilter(clauses, params, p => `sc.client_id = ${p}`, filters.clientId)
  }
  if (filters.campaignStatus) {
    addFilter(clauses, params, p => `s.campaign_status = ${p}`, filters.campaignStatus)
  }
  if (filters.migrationReason) {
    addFilter(clauses, params, p => `s.migration_reason = ${p}`, filters.migrationReason)
  }
  if (filters.stale === 'fresh') {
    clauses.push('s.last_observed_at >= NOW() - INTERVAL \'26 hours\'')
  } else if (filters.stale === 'warning') {
    clauses.push('s.last_observed_at < NOW() - INTERVAL \'26 hours\'')
    clauses.push('s.last_observed_at >= NOW() - INTERVAL \'72 hours\'')
  } else if (filters.stale === 'critical') {
    clauses.push('s.last_observed_at < NOW() - INTERVAL \'72 hours\'')
  }
  if (filters.changedSince) {
    addFilter(clauses, params, p => `s.last_changed_at >= ${p}`, filters.changedSince)
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[\\%_]/g, value => `\\${value}`)
    addFilter(clauses, params, p => `(
      s.campaign_name ILIKE ${p} ESCAPE '\\'
      OR sc.account_name ILIKE ${p} ESCAPE '\\'
      OR ac.name ILIKE ${p} ESCAPE '\\'
    )`, `%${escaped}%`)
  }

  return {
    from: `
      FROM google_ai_max_campaign_state s
      JOIN social_connections sc ON sc.id = s.connection_id
      LEFT JOIN agency_clients ac ON ac.id = sc.client_id
      LEFT JOIN customer_finance cf
        ON cf.tenant_id = s.tenant_id
       AND cf.contact_id = ac.xero_contact_id
      LEFT JOIN team_members owner ON owner.id = cf.account_manager_id
    `,
    where: `WHERE ${clauses.join('\n AND ')}`,
    params
  }
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isoValue(value: string | Date | null | undefined): string | null {
  return value == null ? null : new Date(value).toISOString()
}

function jsonValue<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function nullableEntity(id: unknown, name: unknown): { id: string, name: string | null } | null {
  return typeof id === 'string'
    ? { id, name: typeof name === 'string' ? name : null }
    : null
}

interface ReadinessRow extends DatabaseRow {
  id: string
  connection_id: string
  customer_id: string
  account_name?: string | null
  client_id?: string | null
  client_name?: string | null
  owner_id?: string | null
  owner_name?: string | null
  campaign_id: string
  campaign_name: string
  campaign_status: string
  deep_link?: string | null
  effective_readiness_status?: string | null
  readiness_status: string
  migration_reason: string
  ai_max_enabled: boolean | null
  effective_search_term_matching: string
  effective_text_customisation: string
  effective_final_url_expansion: string
  risk_flags?: unknown
  freshness_status?: string | null
  last_observed_at?: string | Date | null
  last_changed_at?: string | Date | null
  advertising_channel_type?: string | null
  bidding_strategy_type?: string | null
  keyword_match_type?: string | null
  bundling_required?: string | null
  text_asset_automation_status?: string | null
  final_url_expansion_status?: string | null
  ad_group_count?: number
  search_term_matching_disabled_ad_group_count?: number
  raw_evidence?: unknown
  first_observed_at?: string | Date | null
}

interface LatestRunRow extends DatabaseRow {
  id: string
  status: string
  trigger: string
  total_connections?: unknown
  processed_connections?: unknown
  total_campaigns?: unknown
  affected_campaigns?: unknown
  unknown_campaigns?: unknown
  started_at?: string | Date | null
  finished_at?: string | Date | null
  created_at?: string | Date | null
  last_completed_scan_at?: string | Date | null
  coverage_percent?: unknown
}

interface TimelineRow extends DatabaseRow {
  id: string
  event_type: string
  previous_value?: unknown
  current_value: unknown
  observed_at?: string | Date | null
}

interface FacetRow extends DatabaseRow {
  kind: 'connection' | 'client'
  value: string
  label: string
}

function mapListItem(row: ReadinessRow) {
  const freshness = row.freshness_status ?? 'fresh'
  const risks = Array.isArray(row.risk_flags) ? [...row.risk_flags] : []
  if (freshness !== 'fresh' && !risks.includes('STALE_SCAN')) risks.push('STALE_SCAN')

  return {
    id: row.id,
    connectionId: row.connection_id,
    customerId: row.customer_id,
    accountName: row.account_name ?? null,
    client: nullableEntity(row.client_id, row.client_name),
    owner: nullableEntity(row.owner_id, row.owner_name),
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    campaignStatus: row.campaign_status,
    deepLink: row.deep_link ?? null,
    readinessStatus: row.effective_readiness_status ?? row.readiness_status,
    migrationReason: row.migration_reason,
    aiMaxEnabled: row.ai_max_enabled,
    effectiveSettings: {
      searchTermMatching: row.effective_search_term_matching,
      textCustomisation: row.effective_text_customisation,
      finalUrlExpansion: row.effective_final_url_expansion
    },
    risks,
    freshness,
    lastObservedAt: isoValue(row.last_observed_at),
    lastChangedAt: isoValue(row.last_changed_at)
  }
}

const GOOGLE_AI_MAX_EXPORT_LIMIT = 5000

export class GoogleAiMaxExportLimitError extends Error {
  constructor() {
    super(`AI Max export exceeds ${GOOGLE_AI_MAX_EXPORT_LIMIT} rows`)
    this.name = 'GoogleAiMaxExportLimitError'
  }
}

export async function listGoogleAiMaxReadinessForExport(
  input: { tenantId: string, filters: GoogleAiMaxReadinessFilters },
  dependencies: ReadinessQueryDependencies = defaultQueryDependencies
) {
  const dataset = readinessDataset(input.filters, input.tenantId)
  const rows = await dependencies.queryRows<ReadinessRow>(`
    SELECT s.id, s.connection_id, s.customer_id,
           sc.account_name, sc.client_id, ac.name AS client_name,
           cf.account_manager_id AS owner_id, owner.name AS owner_name,
           s.campaign_id, s.campaign_name, s.campaign_status, s.deep_link,
           (${EFFECTIVE_READINESS_SQL}) AS effective_readiness_status,
           (${FRESHNESS_SQL}) AS freshness_status,
           s.migration_reason, s.ai_max_enabled,
           s.effective_search_term_matching, s.effective_text_customisation,
           s.effective_final_url_expansion, s.risk_flags,
           s.last_observed_at, s.last_changed_at
    ${dataset.from}
    ${dataset.where}
    ORDER BY s.last_changed_at DESC, s.id
    LIMIT $${dataset.params.length + 1}
  `, [...dataset.params, GOOGLE_AI_MAX_EXPORT_LIMIT + 1])

  if (rows.length > GOOGLE_AI_MAX_EXPORT_LIMIT) {
    throw new GoogleAiMaxExportLimitError()
  }
  return rows.map(mapListItem)
}

function mapLatestRun(row: LatestRunRow | null) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    totalConnections: numberValue(row.total_connections),
    processedConnections: numberValue(row.processed_connections),
    totalCampaigns: numberValue(row.total_campaigns),
    affectedCampaigns: numberValue(row.affected_campaigns),
    unknownCampaigns: numberValue(row.unknown_campaigns),
    startedAt: isoValue(row.started_at),
    finishedAt: isoValue(row.finished_at),
    createdAt: isoValue(row.created_at)
  }
}

export async function listGoogleAiMaxReadiness(
  input: { tenantId: string, filters: GoogleAiMaxReadinessFilters },
  dependencies: ReadinessQueryDependencies = defaultQueryDependencies
) {
  const dataset = readinessDataset(input.filters, input.tenantId)
  const summaryRow = await dependencies.queryOne(`
    SELECT
      COUNT(*) AS eligible,
      COUNT(*) FILTER (
        WHERE s.ai_max_enabled = TRUE
           OR s.migration_reason NOT IN ('none', 'unknown')
      ) AS affected,
      COUNT(*) FILTER (WHERE s.ai_max_enabled = TRUE) AS enabled,
      COUNT(*) FILTER (WHERE (${EFFECTIVE_READINESS_SQL}) = 'needs_review') AS needs_review,
      COUNT(*) FILTER (WHERE (${EFFECTIVE_READINESS_SQL}) = 'unknown') AS unknown,
      COUNT(*) FILTER (WHERE s.last_changed_at > s.first_observed_at) AS changed
    ${dataset.from}
    ${dataset.where}
  `, dataset.params)

  const itemParams = [
    ...dataset.params,
    input.filters.pageSize,
    (input.filters.page - 1) * input.filters.pageSize
  ]
  const items = await dependencies.queryRows<ReadinessRow>(`
    SELECT s.id, s.connection_id, s.customer_id,
           sc.account_name, sc.client_id, ac.name AS client_name,
           cf.account_manager_id AS owner_id, owner.name AS owner_name,
           s.campaign_id, s.campaign_name, s.campaign_status,
           (${EFFECTIVE_READINESS_SQL}) AS effective_readiness_status,
           (${FRESHNESS_SQL}) AS freshness_status,
           s.migration_reason, s.ai_max_enabled,
           s.effective_search_term_matching, s.effective_text_customisation,
           s.effective_final_url_expansion, s.risk_flags,
           s.last_observed_at, s.last_changed_at
    ${dataset.from}
    ${dataset.where}
    ORDER BY
      CASE (${EFFECTIVE_READINESS_SQL})
        WHEN 'unknown' THEN 1
        WHEN 'needs_review' THEN 2
        WHEN 'scheduled_upgrade' THEN 3
        WHEN 'ready' THEN 4
        ELSE 5
      END,
      s.last_changed_at DESC,
      s.id
    LIMIT $${dataset.params.length + 1}
    OFFSET $${dataset.params.length + 2}
  `, itemParams)

  const facetRows = await dependencies.queryRows<FacetRow>(`
    SELECT DISTINCT
           'connection'::text AS kind,
           sc.id::text AS value,
           COALESCE(sc.account_name, sc.account_id) AS label
    FROM google_ai_max_campaign_state s
    JOIN social_connections sc ON sc.id = s.connection_id
    WHERE s.tenant_id = $1
    UNION ALL
    SELECT DISTINCT
           'client'::text AS kind,
           ac.id::text AS value,
           ac.name AS label
    FROM google_ai_max_campaign_state s
    JOIN social_connections sc ON sc.id = s.connection_id
    JOIN agency_clients ac ON ac.id = sc.client_id
    WHERE s.tenant_id = $1
    ORDER BY kind, label, value
  `, [input.tenantId]) ?? []

  const latestRunRow = await dependencies.queryOne<LatestRunRow>(`
    WITH latest_any AS (
      SELECT *
      FROM google_ai_max_scan_runs
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    ), latest_terminal AS (
      SELECT *
      FROM google_ai_max_scan_runs
      WHERE tenant_id = $1
        AND status IN ('completed', 'partial')
      ORDER BY finished_at DESC
      LIMIT 1
    )
    SELECT latest_any.*,
           latest_terminal.finished_at AS last_completed_scan_at,
           CASE
             WHEN latest_terminal.total_connections > 0
             THEN ROUND(
               latest_terminal.processed_connections::numeric
               / latest_terminal.total_connections::numeric * 100,
               2
             )
             ELSE NULL
           END AS coverage_percent
    FROM latest_any
    LEFT JOIN latest_terminal ON TRUE
  `, [input.tenantId])

  const eligible = numberValue(summaryRow?.eligible)
  return {
    summary: {
      eligible,
      affected: numberValue(summaryRow?.affected),
      enabled: numberValue(summaryRow?.enabled),
      needsReview: numberValue(summaryRow?.needs_review),
      unknown: numberValue(summaryRow?.unknown),
      changed: numberValue(summaryRow?.changed),
      lastCompletedScanAt: isoValue(latestRunRow?.last_completed_scan_at),
      coveragePercent: latestRunRow?.coverage_percent == null
        ? null
        : numberValue(latestRunRow.coverage_percent)
    },
    items: items.map(mapListItem),
    pagination: {
      page: input.filters.page,
      pageSize: input.filters.pageSize,
      total: eligible
    },
    facets: {
      connections: facetRows
        .filter(row => row.kind === 'connection')
        .map(row => ({ label: row.label, value: row.value })),
      clients: facetRows
        .filter(row => row.kind === 'client')
        .map(row => ({ label: row.label, value: row.value }))
    },
    latestRun: mapLatestRun(latestRunRow)
  }
}

function mapDetail(row: ReadinessRow, timeline: TimelineRow[]) {
  return {
    ...mapListItem(row),
    advertisingChannelType: row.advertising_channel_type,
    biddingStrategyType: row.bidding_strategy_type,
    keywordMatchType: row.keyword_match_type,
    bundlingRequired: row.bundling_required,
    textAssetAutomationStatus: row.text_asset_automation_status,
    finalUrlExpansionStatus: row.final_url_expansion_status,
    adGroups: {
      total: row.ad_group_count,
      searchTermMatchingDisabled: row.search_term_matching_disabled_ad_group_count
    },
    deepLink: row.deep_link ?? null,
    rawEvidence: jsonValue(row.raw_evidence),
    firstObservedAt: isoValue(row.first_observed_at),
    timeline: timeline.map(event => ({
      id: event.id,
      eventType: event.event_type,
      previousValue: event.previous_value == null ? null : jsonValue(event.previous_value),
      currentValue: jsonValue(event.current_value),
      observedAt: isoValue(event.observed_at)
    }))
  }
}

export async function getGoogleAiMaxReadinessDetail(
  tenantId: string,
  stateId: string,
  dependencies: ReadinessQueryDependencies = defaultQueryDependencies
) {
  const row = await dependencies.queryOne<ReadinessRow>(`
    SELECT s.*,
           (${EFFECTIVE_READINESS_SQL}) AS effective_readiness_status,
           (${FRESHNESS_SQL}) AS freshness_status,
           sc.account_name, sc.client_id, ac.name AS client_name,
           cf.account_manager_id AS owner_id, owner.name AS owner_name
    FROM google_ai_max_campaign_state s
    JOIN social_connections sc ON sc.id = s.connection_id
    LEFT JOIN agency_clients ac ON ac.id = sc.client_id
    LEFT JOIN customer_finance cf
      ON cf.tenant_id = s.tenant_id
     AND cf.contact_id = ac.xero_contact_id
    LEFT JOIN team_members owner ON owner.id = cf.account_manager_id
    WHERE s.tenant_id = $1
      AND s.id = $2
  `, [tenantId, stateId])
  if (!row) return null

  const timeline = await dependencies.queryRows<TimelineRow>(`
    SELECT id, event_type, previous_value, current_value, observed_at
    FROM google_ai_max_state_events
    WHERE tenant_id = $1
      AND campaign_state_id = $2
    ORDER BY observed_at DESC, id DESC
    LIMIT 100
  `, [tenantId, stateId])
  return mapDetail(row, timeline)
}
