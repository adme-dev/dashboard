import type { SiteIntelligenceDomain } from '~~/app/types/site-intelligence'
import type { SiteIntelligenceDomainInput } from '~~/server/utils/siteIntelligence/contracts'
import type { SiteIntelligenceAuditActor } from '~~/server/utils/siteIntelligence/audit'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { writeSiteIntelligenceAudit } from '~~/server/utils/siteIntelligence/audit'

interface SiteIntelligenceDomainRow {
  id: string
  client_id: string
  client_name?: string
  lane: SiteIntelligenceDomain['lane']
  name: string
  origin: string
  justification: string
  approved_by: string | null
  approved_at: string | Date | null
  status: SiteIntelligenceDomain['status']
  discovery_mode: SiteIntelligenceDomain['discoveryMode']
  include_patterns: string[] | null
  exclude_patterns: string[] | null
  include_subdomains: boolean
  render_mode: SiteIntelligenceDomain['renderMode']
  page_limit: number | string
  crawl_depth: number | string
  frequency: SiteIntelligenceDomain['frequency']
  crawl_purposes: SiteIntelligenceDomain['crawlPurposes']
  ai_input_allowed: boolean
  retention_days: number | string
  last_run_at: string | Date | null
  next_run_at: string | Date | null
  latest_run_status: SiteIntelligenceDomain['latestRunStatus']
  created_at: string | Date
  updated_at: string | Date
}

export interface SiteIntelligenceDomainFilters {
  clientId?: string
  lane?: SiteIntelligenceDomain['lane']
  status?: SiteIntelligenceDomain['status']
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : value
}

export function mapSiteIntelligenceDomainRow(row: SiteIntelligenceDomainRow): SiteIntelligenceDomain {
  return {
    id: row.id,
    clientId: row.client_id,
    ...(row.client_name ? { clientName: row.client_name } : {}),
    lane: row.lane,
    name: row.name,
    origin: row.origin,
    justification: row.justification,
    approvedBy: row.approved_by,
    approvedAt: iso(row.approved_at),
    status: row.status,
    discoveryMode: row.discovery_mode,
    includePatterns: row.include_patterns ?? [],
    excludePatterns: row.exclude_patterns ?? [],
    includeSubdomains: row.include_subdomains,
    renderMode: row.render_mode,
    pageLimit: Number(row.page_limit),
    depth: Number(row.crawl_depth),
    frequency: row.frequency,
    crawlPurposes: row.crawl_purposes,
    aiInputAllowed: row.ai_input_allowed,
    retentionDays: Number(row.retention_days),
    lastRunAt: iso(row.last_run_at),
    nextRunAt: iso(row.next_run_at),
    latestRunStatus: row.latest_run_status,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!
  }
}

const DOMAIN_SELECT = `
  SELECT d.*, c.name AS client_name
  FROM site_intelligence_domains d
  JOIN agency_clients c ON c.id = d.client_id
`

export async function listSiteIntelligenceDomains(
  clientScope: string[] | null,
  filters: SiteIntelligenceDomainFilters
): Promise<SiteIntelligenceDomain[]> {
  if (clientScope?.length === 0) return []

  const conditions: string[] = []
  const params: unknown[] = []
  const add = (condition: (position: number) => string, value: unknown) => {
    params.push(value)
    conditions.push(condition(params.length))
  }

  if (clientScope !== null) add(position => `d.client_id = ANY($${position}::uuid[])`, clientScope)
  if (filters.clientId) add(position => `d.client_id = $${position}`, filters.clientId)
  if (filters.lane) add(position => `d.lane = $${position}`, filters.lane)
  if (filters.status) add(position => `d.status = $${position}`, filters.status)

  const rows = await queryRows<SiteIntelligenceDomainRow>(`
    ${DOMAIN_SELECT}
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY c.name ASC, d.lane ASC, d.name ASC
  `, params)

  return rows.map(mapSiteIntelligenceDomainRow)
}

export async function getSiteIntelligenceDomainForActor(
  clientScope: string[] | null,
  domainId: string
): Promise<SiteIntelligenceDomain | null> {
  if (clientScope?.length === 0) return null
  const scoped = clientScope !== null
  const row = await queryOne<SiteIntelligenceDomainRow>(`
    ${DOMAIN_SELECT}
    WHERE d.id = $1${scoped ? ' AND d.client_id = ANY($2::uuid[])' : ''}
    LIMIT 1
  `, scoped ? [domainId, clientScope] : [domainId])
  return row ? mapSiteIntelligenceDomainRow(row) : null
}

function domainWriteValues(input: SiteIntelligenceDomainInput): unknown[] {
  return [
    input.name,
    input.origin,
    input.justification,
    input.status,
    input.discoveryMode,
    input.includePatterns,
    input.excludePatterns,
    input.includeSubdomains,
    input.renderMode,
    input.pageLimit,
    input.depth,
    input.frequency,
    input.crawlPurposes,
    input.aiInputAllowed,
    input.retentionDays
  ]
}

const DOMAIN_CHANGED_FIELDS = [
  'name',
  'origin',
  'justification',
  'status',
  'discoveryMode',
  'includePatterns',
  'excludePatterns',
  'includeSubdomains',
  'renderMode',
  'pageLimit',
  'depth',
  'frequency',
  'crawlPurposes',
  'aiInputAllowed',
  'retentionDays'
]

export async function createSiteIntelligenceDomain(
  actor: SiteIntelligenceAuditActor,
  input: SiteIntelligenceDomainInput
): Promise<SiteIntelligenceDomain> {
  return transaction(async (db) => {
    const result = await db.query<SiteIntelligenceDomainRow>(`
      INSERT INTO site_intelligence_domains (
        client_id, lane, name, origin, justification, approved_by, approved_at,
        status, discovery_mode, include_patterns, exclude_patterns,
        include_subdomains, render_mode, page_limit, crawl_depth, frequency,
        crawl_purposes, ai_input_allowed, retention_days, created_by, updated_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, NOW(),
        $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $6, $6
      )
      RETURNING *
    `, [input.clientId, input.lane, ...domainWriteValues(input).slice(0, 3), actor.id, ...domainWriteValues(input).slice(3)])
    const row = result.rows[0]
    if (!row) throw new Error('Site intelligence domain insert returned no row')

    await writeSiteIntelligenceAudit(
      actor,
      input.clientId,
      'domain.created',
      'domain',
      row.id,
      {
        lane: input.lane,
        status: input.status,
        frequency: input.frequency,
        changedFields: DOMAIN_CHANGED_FIELDS
      },
      db
    )

    return mapSiteIntelligenceDomainRow(row)
  })
}

export async function updateSiteIntelligenceDomain(
  actor: SiteIntelligenceAuditActor,
  domainId: string,
  input: SiteIntelligenceDomainInput
): Promise<SiteIntelligenceDomain | null> {
  return transaction(async (db) => {
    const result = await db.query<SiteIntelligenceDomainRow>(`
      UPDATE site_intelligence_domains
      SET lane = $3,
          name = $4,
          origin = $5,
          justification = $6,
          status = $7,
          discovery_mode = $8,
          include_patterns = $9,
          exclude_patterns = $10,
          include_subdomains = $11,
          render_mode = $12,
          page_limit = $13,
          crawl_depth = $14,
          frequency = $15,
          crawl_purposes = $16,
          ai_input_allowed = $17,
          retention_days = $18,
          updated_by = $19
      WHERE id = $1 AND client_id = $2
      RETURNING *
    `, [domainId, input.clientId, input.lane, ...domainWriteValues(input), actor.id])
    const row = result.rows[0]
    if (!row) return null

    await writeSiteIntelligenceAudit(
      actor,
      input.clientId,
      'domain.updated',
      'domain',
      row.id,
      {
        lane: input.lane,
        status: input.status,
        frequency: input.frequency,
        changedFields: DOMAIN_CHANGED_FIELDS
      },
      db
    )

    return mapSiteIntelligenceDomainRow(row)
  })
}
