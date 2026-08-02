import type { AudienceRange } from '~~/app/types/audience-analytics'
import type {
  AutomotivePageFacts,
  SiteIntelligenceChange,
  SiteIntelligenceChangeResponse,
  SiteIntelligenceDomain,
  SiteIntelligenceGapResponse,
  SiteIntelligenceOverviewResponse,
  SiteIntelligenceRun
} from '~~/app/types/site-intelligence'
import type { SiteIntelligenceDomainInput } from '~~/server/utils/siteIntelligence/contracts'
import type { SiteIntelligenceAuditActor } from '~~/server/utils/siteIntelligence/audit'
import type { PreparedSiteIntelligenceRecord } from '~~/server/utils/siteIntelligence/storage'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { writeSiteIntelligenceAudit } from '~~/server/utils/siteIntelligence/audit'
import { diffAutomotiveFacts } from '~~/server/utils/siteIntelligence/diff'
import {
  compareAutomotiveOffers,
  deriveSiteIntelligenceInsights,
  joinOwnedAudienceContext,
  type SiteIntelligenceCandidateChange,
  type SiteIntelligenceCandidatePage
} from '~~/server/utils/siteIntelligence/intelligence'
import { getAudienceBreakdowns } from '~~/server/utils/tracking/audience-repository'

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

export interface SiteIntelligenceRepositoryExecutor {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
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

export async function getSiteIntelligenceDomainForClient(
  clientId: string,
  domainId: string,
  executor?: SiteIntelligenceRepositoryExecutor
): Promise<SiteIntelligenceDomain | null> {
  const sql = `SELECT * FROM site_intelligence_domains WHERE client_id = $1 AND id = $2 LIMIT 1`
  const params = [clientId, domainId]
  if (executor) {
    const result = await executor.query<SiteIntelligenceDomainRow>(sql, params)
    return result.rows[0] ? mapSiteIntelligenceDomainRow(result.rows[0]) : null
  }
  const row = await queryOne<SiteIntelligenceDomainRow>(sql, params)
  return row ? mapSiteIntelligenceDomainRow(row) : null
}

export async function findSiteIntelligenceDomainByOrigin(
  clientId: string,
  origin: string,
  lane: SiteIntelligenceDomain['lane'],
  executor?: SiteIntelligenceRepositoryExecutor
): Promise<SiteIntelligenceDomain | null> {
  const sql = `
    SELECT * FROM site_intelligence_domains
    WHERE client_id = $1 AND origin = $2 AND lane = $3
    LIMIT 1
  `
  const params = [clientId, origin, lane]
  if (executor) {
    const result = await executor.query<SiteIntelligenceDomainRow>(sql, params)
    return result.rows[0] ? mapSiteIntelligenceDomainRow(result.rows[0]) : null
  }
  const row = await queryOne<SiteIntelligenceDomainRow>(sql, params)
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
  input: SiteIntelligenceDomainInput,
  executor?: SiteIntelligenceRepositoryExecutor
): Promise<SiteIntelligenceDomain> {
  const create = async (db: SiteIntelligenceRepositoryExecutor) => {
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
  }
  if (executor) return create(executor)
  return transaction(async db => create(db as SiteIntelligenceRepositoryExecutor))
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

export interface SiteIntelligenceRunConfig {
  id: string
  clientId: string
  domainId: string
  trigger: 'manual' | 'schedule' | 'retry'
  settings: Record<string, unknown>
}

export interface SiteIntelligenceDomainRunState {
  hasRun: boolean
  run: { id: string, status: SiteIntelligenceRun['status'] } | null
}

export async function getSiteIntelligenceDomainRunState(
  domainId: string,
  executor?: SiteIntelligenceRepositoryExecutor
): Promise<SiteIntelligenceDomainRunState> {
  const sql = `
    SELECT id, status FROM site_intelligence_crawl_runs
    WHERE domain_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `
  const params = [domainId]
  if (executor) {
    const result = await executor.query<{ id: string, status: SiteIntelligenceRun['status'] }>(sql, params)
    return { hasRun: Boolean(result.rows[0]), run: result.rows[0] ?? null }
  }
  const row = await queryOne<{ id: string, status: SiteIntelligenceRun['status'] }>(sql, params)
  return { hasRun: Boolean(row), run: row }
}

export async function createSiteIntelligenceCrawlRun(
  actor: SiteIntelligenceAuditActor,
  domainId: string,
  trigger: 'manual' | 'schedule' | 'retry'
): Promise<{ status: 'created', run: SiteIntelligenceRunConfig } | { status: 'not_found' | 'inactive' | 'active_run', run: null }> {
  return transaction(async (db) => {
    const domainResult = await db.query<SiteIntelligenceDomainRow>(`
      SELECT * FROM site_intelligence_domains WHERE id = $1 FOR UPDATE
    `, [domainId])
    const domain = domainResult.rows[0]
    if (!domain) return { status: 'not_found' as const, run: null }
    if (domain.status !== 'active') return { status: 'inactive' as const, run: null }

    const active = await db.query<{ id: string }>(`
      SELECT id FROM site_intelligence_crawl_runs
      WHERE domain_id = $1 AND status IN ('queued', 'running') LIMIT 1
    `, [domainId])
    if (active.rows[0]) return { status: 'active_run' as const, run: null }

    const settings = {
      origin: domain.origin,
      lane: domain.lane,
      discoveryMode: domain.discovery_mode,
      includePatterns: domain.include_patterns ?? [],
      excludePatterns: domain.exclude_patterns ?? [],
      includeSubdomains: domain.include_subdomains,
      renderMode: domain.render_mode,
      pageLimit: Number(domain.page_limit),
      depth: Number(domain.crawl_depth),
      crawlPurposes: domain.crawl_purposes,
      aiInputAllowed: domain.ai_input_allowed,
      retentionDays: Number(domain.retention_days)
    }
    const result = await db.query<{ id: string }>(`
      INSERT INTO site_intelligence_crawl_runs (
        client_id, domain_id, trigger, status, settings, requested_by
      ) VALUES ($1, $2, $3, 'queued', $4::jsonb, $5)
      RETURNING id
    `, [domain.client_id, domain.id, trigger, JSON.stringify(settings), actor.id])
    const id = result.rows[0]?.id
    if (!id) throw new Error('Site intelligence crawl run insert returned no row')
    await writeSiteIntelligenceAudit(actor, domain.client_id, 'run.created', 'run', id, {
      trigger,
      domainId: domain.id
    }, db)
    return {
      status: 'created' as const,
      run: { id, clientId: domain.client_id, domainId: domain.id, trigger, settings }
    }
  })
}

export async function markSiteIntelligenceRunWorkflowStarted(runId: string, clientId: string, instanceId: string) {
  await queryOne(`UPDATE site_intelligence_crawl_runs
    SET workflow_instance_id = $3, status = 'running', started_at = COALESCE(started_at, NOW())
    WHERE id = $1 AND client_id = $2 AND status = 'queued' RETURNING id`, [runId, clientId, instanceId])
}

export async function failSiteIntelligenceRun(runId: string, clientId: string, category: string, summary: string) {
  await queryOne(`UPDATE site_intelligence_crawl_runs
    SET status = 'failed', error_category = $3, error_summary = $4, completed_at = NOW()
    WHERE id = $1 AND client_id = $2 AND status IN ('queued', 'running') RETURNING id`,
  [runId, clientId, category.slice(0, 120), summary.slice(0, 1000)])
}

export async function getSiteIntelligenceRunConfig(
  runId: string,
  clientId: string,
  domainId: string
): Promise<SiteIntelligenceRunConfig | null> {
  const row = await queryOne<{ id: string, client_id: string, domain_id: string, trigger: SiteIntelligenceRunConfig['trigger'], settings: Record<string, unknown> }>(`
    SELECT id, client_id, domain_id, trigger, settings
    FROM site_intelligence_crawl_runs
    WHERE id = $1 AND client_id = $2 AND domain_id = $3
  `, [runId, clientId, domainId])
  return row ? { id: row.id, clientId: row.client_id, domainId: row.domain_id, trigger: row.trigger, settings: row.settings } : null
}

export async function recordSiteIntelligenceIngestBatch(
  runId: string,
  input: {
    clientId: string
    domainId: string
    batchKey: string
    records: PreparedSiteIntelligenceRecord[]
  }
): Promise<{ replayed: boolean, enrichmentJobs: SiteIntelligenceEnrichmentJobPayload[] } | null> {
  return transaction(async (db) => {
    const run = await db.query<{ id: string, lane: 'owned' | 'competitor' }>(`
      SELECT r.id, d.lane
      FROM site_intelligence_crawl_runs r
      JOIN site_intelligence_domains d
        ON d.id = r.domain_id AND d.client_id = r.client_id
      WHERE r.id = $1 AND r.client_id = $2 AND r.domain_id = $3
      FOR UPDATE OF r, d
    `, [runId, input.clientId, input.domainId])
    if (!run.rows[0]) return null
    const inserted = await db.query<{ id: string }>(`INSERT INTO site_intelligence_ingest_batches
      (client_id, run_id, batch_key, record_count) VALUES ($1, $2, $3, $4)
      ON CONFLICT (run_id, batch_key) DO NOTHING RETURNING id`,
    [input.clientId, runId, input.batchKey, input.records.length])
    if (!inserted.rows[0]) return { replayed: true, enrichmentJobs: [] }

    const enrichmentJobs: SiteIntelligenceEnrichmentJobPayload[] = []
    let changedPages = 0
    for (const record of input.records) {
      const existingResult = await db.query<SiteIntelligencePageState>(`
        SELECT id, content_hash, facts
        FROM site_intelligence_pages
        WHERE client_id = $1 AND domain_id = $2 AND canonical_url = $3
        FOR UPDATE
      `, [input.clientId, input.domainId, record.canonicalUrl])
      const existing = existingResult.rows[0]
      const diff = diffAutomotiveFacts(existing?.facts ?? null, record.facts, {
        currentEvidence: record.evidence
      })
      const material = record.status === 'completed'
        && Boolean(record.contentHash)
        && (!existing || (existing.content_hash !== record.contentHash && diff.material))
      const pageId = existing
        ? await updateSiteIntelligencePage(db, existing.id, input, record, material)
        : await insertSiteIntelligencePage(db, input, record)

      if (!pageId || record.status !== 'completed' || !record.contentHash) continue
      if (!material) continue

      const change = await db.query<{ id: string }>(`
        INSERT INTO site_intelligence_changes (
          client_id, domain_id, page_id, run_id, lane, change_type,
          previous_hash, current_hash, fact_diff, evidence_excerpts, source_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
        ON CONFLICT (page_id, current_hash) DO NOTHING
        RETURNING id
      `, [
        input.clientId,
        input.domainId,
        pageId,
        runId,
        run.rows[0].lane,
        existing ? 'facts_changed' : 'page_added',
        existing?.content_hash ?? null,
        record.contentHash,
        JSON.stringify(diff),
        JSON.stringify(diff.evidence),
        record.sourceUrl
      ])
      const changeId = change.rows[0]?.id
      if (!changeId) continue
      changedPages += 1
      enrichmentJobs.push({
        clientId: input.clientId,
        domainId: input.domainId,
        pageId,
        changeId,
        contentHash: record.contentHash
      })
    }

    const completed = input.records.filter(record => record.status === 'completed').length
    const disallowed = input.records.filter(record => record.status === 'disallowed').length
    const errored = input.records.filter(record => record.status === 'errored').length
    await db.query(`UPDATE site_intelligence_crawl_runs SET
      completed_pages = completed_pages + $4,
      disallowed_pages = disallowed_pages + $5,
      errored_pages = errored_pages + $6,
      changed_pages = changed_pages + $7
      WHERE id = $1 AND client_id = $2 AND domain_id = $3`,
    [runId, input.clientId, input.domainId, completed, disallowed, errored, changedPages])
    return { replayed: false, enrichmentJobs }
  })
}

interface SiteIntelligencePageState {
  id: string
  content_hash: string | null
  facts: PreparedSiteIntelligenceRecord['facts']
}

export interface SiteIntelligenceEnrichmentJobPayload extends Record<string, unknown> {
  clientId: string
  domainId: string
  pageId: string
  changeId: string | null
  contentHash: string
}

interface TransactionDb {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
}

async function insertSiteIntelligencePage(
  db: TransactionDb,
  input: { clientId: string, domainId: string },
  record: PreparedSiteIntelligenceRecord
): Promise<string | null> {
  const result = await db.query<{ id: string }>(`
    INSERT INTO site_intelligence_pages (
      client_id, domain_id, canonical_url, source_url, status, http_status, title,
      content_hash, r2_object_key, metadata, facts, extraction_version, last_changed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12,
      CASE WHEN $8::text IS NULL THEN NULL ELSE NOW() END
    )
    RETURNING id
  `, [
    input.clientId,
    input.domainId,
    record.canonicalUrl,
    record.sourceUrl,
    record.status,
    record.httpStatus,
    record.title,
    record.contentHash,
    record.r2ObjectKey,
    JSON.stringify(record.metadata),
    JSON.stringify(record.facts),
    record.extractionVersion
  ])
  return result.rows[0]?.id ?? null
}

async function updateSiteIntelligencePage(
  db: TransactionDb,
  pageId: string,
  input: { clientId: string, domainId: string },
  record: PreparedSiteIntelligenceRecord,
  material: boolean
): Promise<string | null> {
  const result = await db.query<{ id: string }>(`
    UPDATE site_intelligence_pages
    SET source_url = $4,
        status = $5,
        http_status = $6,
        title = $7,
        content_hash = COALESCE($8, content_hash),
        r2_object_key = COALESCE($9, r2_object_key),
        metadata = $10::jsonb,
        facts = CASE WHEN $8::text IS NULL THEN facts ELSE $11::jsonb END,
        extraction_version = CASE WHEN $8::text IS NULL THEN extraction_version ELSE $12 END,
        last_seen_at = NOW(),
        last_changed_at = CASE WHEN $13::boolean THEN NOW() ELSE last_changed_at END
    WHERE id = $1 AND client_id = $2 AND domain_id = $3
    RETURNING id
  `, [
    pageId,
    input.clientId,
    input.domainId,
    record.sourceUrl,
    record.status,
    record.httpStatus,
    record.title,
    record.contentHash,
    record.r2ObjectKey,
    JSON.stringify(record.metadata),
    JSON.stringify(record.facts),
    record.extractionVersion,
    material
  ])
  return result.rows[0]?.id ?? null
}

export async function completeSiteIntelligenceRun(runId: string, input: {
  clientId: string
  domainId: string
  status: 'completed' | 'partial' | 'blocked' | 'failed' | 'cancelled'
  cloudflareJobId?: string
  totalPages?: number
  completedPages?: number
  disallowedPages?: number
  erroredPages?: number
  browserSeconds?: number
  errorCategory?: string
  errorSummary?: string
}) {
  return queryOne<{ id: string, status: string }>(`UPDATE site_intelligence_crawl_runs SET
    status = $4, cloudflare_job_id = COALESCE($5, cloudflare_job_id),
    total_pages = COALESCE($6, total_pages), completed_pages = COALESCE($7, completed_pages),
    disallowed_pages = COALESCE($8, disallowed_pages), errored_pages = COALESCE($9, errored_pages),
    browser_seconds = COALESCE($10, browser_seconds), error_category = $11,
    error_summary = $12, completed_at = NOW()
    WHERE id = $1 AND client_id = $2 AND domain_id = $3
      AND status IN ('queued', 'running') RETURNING id, status`, [
    runId, input.clientId, input.domainId, input.status, input.cloudflareJobId ?? null,
    input.totalPages ?? null, input.completedPages ?? null, input.disallowedPages ?? null,
    input.erroredPages ?? null, input.browserSeconds ?? null, input.errorCategory ?? null,
    input.errorSummary?.slice(0, 1000) ?? null
  ])
}

interface SiteIntelligenceReadPageRow {
  id: string
  client_id: string
  domain_id: string
  lane: 'owned' | 'competitor'
  canonical_url: string
  source_url: string
  facts: Partial<AutomotivePageFacts>
  last_seen_at: string | Date
}

interface SiteIntelligenceReadChangeRow {
  id: string
  client_id: string
  domain_id: string
  page_id: string
  run_id: string
  lane: 'owned' | 'competitor'
  change_type: string
  fact_diff: SiteIntelligenceChange['factDiff']
  source_url: string
  observed_at: string | Date
  confidence: number | string
  review_status: SiteIntelligenceChange['reviewStatus']
}

interface SiteIntelligenceReadRunRow {
  id: string
  client_id: string
  domain_id: string
  trigger: SiteIntelligenceRun['trigger']
  status: SiteIntelligenceRun['status']
  workflow_instance_id: string | null
  cloudflare_job_id: string | null
  settings: SiteIntelligenceRun['settings']
  total_pages: number | string
  completed_pages: number | string
  changed_pages: number | string
  disallowed_pages: number | string
  errored_pages: number | string
  browser_seconds: number | string | null
  error_category: string | null
  error_summary: string | null
  requested_by: string | null
  started_at: string | Date | null
  completed_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

export interface SiteIntelligenceReadFilters {
  clientIds: string[] | null
  range: AudienceRange
  lane?: 'owned' | 'competitor'
}

export interface SiteIntelligenceChangeReadFilters extends SiteIntelligenceReadFilters {
  changeType?: 'page_added' | 'facts_changed'
  cursor?: { observedAt: string, id: string }
  limit: number
}

function readScopeSql(
  clientIds: string[] | null,
  params: unknown[],
  alias: string
): string[] {
  if (clientIds === null) return []
  if (clientIds.length === 0) return ['FALSE']
  params.push(clientIds)
  return [`${alias}.client_id = ANY($${params.length}::uuid[])`]
}

function readDateSql(range: AudienceRange, params: unknown[], alias: string, column: string): string[] {
  params.push(range.fromDate, range.toDate)
  return [
    `${alias}.${column} >= $${params.length - 1}::date`,
    `${alias}.${column} < ($${params.length}::date + INTERVAL '1 day')`
  ]
}

function mapReadPage(row: SiteIntelligenceReadPageRow): SiteIntelligenceCandidatePage {
  return {
    id: row.id,
    clientId: row.client_id,
    domainId: row.domain_id,
    lane: row.lane,
    canonicalUrl: row.canonical_url,
    sourceUrl: row.source_url,
    facts: row.facts,
    observedAt: iso(row.last_seen_at)!
  }
}

function mapReadChange(row: SiteIntelligenceReadChangeRow): SiteIntelligenceChange {
  return {
    id: row.id,
    clientId: row.client_id,
    domainId: row.domain_id,
    pageId: row.page_id,
    runId: row.run_id,
    lane: row.lane,
    changeType: row.change_type,
    factDiff: row.fact_diff,
    sourceUrl: row.source_url,
    observedAt: iso(row.observed_at)!,
    confidence: Number(row.confidence),
    reviewStatus: row.review_status
  }
}

function toCandidateChange(change: SiteIntelligenceChange): SiteIntelligenceCandidateChange {
  return {
    id: change.id,
    pageId: change.pageId,
    lane: change.lane,
    sourceUrl: change.sourceUrl,
    observedAt: change.observedAt,
    changedFields: change.factDiff.changedFields ?? [],
    before: change.factDiff.before,
    after: change.factDiff.after
  }
}

function mapReadRun(row: SiteIntelligenceReadRunRow): SiteIntelligenceRun {
  return {
    id: row.id,
    clientId: row.client_id,
    domainId: row.domain_id,
    trigger: row.trigger,
    status: row.status,
    workflowInstanceId: row.workflow_instance_id,
    cloudflareJobId: row.cloudflare_job_id,
    settings: row.settings,
    totalPages: Number(row.total_pages),
    completedPages: Number(row.completed_pages),
    changedPages: Number(row.changed_pages),
    disallowedPages: Number(row.disallowed_pages),
    erroredPages: Number(row.errored_pages),
    browserSeconds: row.browser_seconds === null ? null : Number(row.browser_seconds),
    errorCategory: row.error_category,
    errorSummary: row.error_summary,
    requestedBy: row.requested_by,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!
  }
}

async function loadReadPages(filters: SiteIntelligenceReadFilters): Promise<SiteIntelligenceCandidatePage[]> {
  const params: unknown[] = []
  const conditions = readScopeSql(filters.clientIds, params, 'p')
  conditions.push(`p.status = 'completed'`)
  if (filters.lane) {
    params.push(filters.lane)
    conditions.push(`d.lane = $${params.length}`)
  }
  const rows = await queryRows<SiteIntelligenceReadPageRow>(`
    SELECT p.id, p.client_id, p.domain_id, d.lane, p.canonical_url,
           p.source_url, p.facts, p.last_seen_at
    FROM site_intelligence_pages p
    JOIN site_intelligence_domains d
      ON d.id = p.domain_id AND d.client_id = p.client_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.client_id, p.last_seen_at DESC, p.id DESC
  `, params)
  return rows.map(mapReadPage)
}

async function loadLatestReadRuns(filters: SiteIntelligenceReadFilters): Promise<SiteIntelligenceRun[]> {
  const params: unknown[] = []
  const conditions = readScopeSql(filters.clientIds, params, 'r')
  if (filters.lane) {
    params.push(filters.lane)
    conditions.push(`d.lane = $${params.length}`)
  }
  const rows = await queryRows<SiteIntelligenceReadRunRow>(`
    SELECT DISTINCT ON (r.domain_id)
      r.id, r.client_id, r.domain_id, r.trigger, r.status,
      r.workflow_instance_id, r.cloudflare_job_id, r.settings,
      r.total_pages, r.completed_pages, r.changed_pages,
      r.disallowed_pages, r.errored_pages, r.browser_seconds,
      r.error_category, r.error_summary, r.requested_by,
      r.started_at, r.completed_at, r.created_at, r.updated_at
    FROM site_intelligence_crawl_runs r
    JOIN site_intelligence_domains d
      ON d.id = r.domain_id AND d.client_id = r.client_id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY r.domain_id, r.created_at DESC, r.id DESC
  `, params)
  return rows.map(mapReadRun)
}

async function loadRecentReadChanges(
  filters: SiteIntelligenceReadFilters,
  limit = 250
): Promise<SiteIntelligenceChange[]> {
  const params: unknown[] = []
  const conditions = [
    ...readScopeSql(filters.clientIds, params, 'ch'),
    ...readDateSql(filters.range, params, 'ch', 'observed_at')
  ]
  if (filters.lane) {
    params.push(filters.lane)
    conditions.push(`ch.lane = $${params.length}`)
  }
  params.push(limit)
  const rows = await queryRows<SiteIntelligenceReadChangeRow>(`
    SELECT ch.id, ch.client_id, ch.domain_id, ch.page_id, ch.run_id,
           ch.lane, ch.change_type, ch.fact_diff, ch.source_url,
           ch.observed_at, ch.confidence, ch.review_status
    FROM site_intelligence_changes ch
    WHERE ${conditions.join(' AND ')}
    ORDER BY ch.observed_at DESC, ch.id DESC
    LIMIT $${params.length}
  `, params)
  return rows.map(mapReadChange)
}

async function loadReadClients(clientIds: string[] | null): Promise<Array<{ id: string, name: string }>> {
  const params: unknown[] = []
  const conditions: string[] = []
  if (clientIds !== null) {
    if (clientIds.length === 0) conditions.push('FALSE')
    else {
      params.push(clientIds)
      conditions.push(`c.id = ANY($${params.length}::uuid[])`)
    }
  }
  return queryRows<{ id: string, name: string }>(`
    SELECT c.id, c.name
    FROM agency_clients c
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY c.name ASC, c.id ASC
  `, params)
}

export async function getSiteIntelligenceOverviewRead(
  filters: SiteIntelligenceReadFilters
): Promise<SiteIntelligenceOverviewResponse> {
  const [domains, runs, pages, changes, availableClients] = await Promise.all([
    listSiteIntelligenceDomains(filters.clientIds, { lane: filters.lane }),
    loadLatestReadRuns(filters),
    loadReadPages(filters),
    loadRecentReadChanges(filters),
    loadReadClients(filters.clientIds)
  ])
  const clientIds = Array.from(new Set(pages.map(page => page.clientId)))
  const audienceByClient = new Map(await Promise.all(clientIds.map(async (clientId) => {
    const breakdowns = await getAudienceBreakdowns({
      range: filters.range,
      clientIds: [clientId],
      dimension: 'page'
    })
    return [clientId, joinOwnedAudienceContext(
      pages.filter(page => page.clientId === clientId && page.lane === 'owned').map(page => ({
        pageId: page.id,
        canonicalUrl: page.canonicalUrl
      })),
      breakdowns.rows
    )] as const
  })))
  const now = new Date()
  const insights = clientIds.flatMap(clientId => deriveSiteIntelligenceInsights({
    clientId,
    pages: pages.filter(page => page.clientId === clientId),
    changes: changes.filter(change => change.clientId === clientId).map(toCandidateChange),
    audienceContext: audienceByClient.get(clientId) ?? [],
    now
  }))
  const latestRun = new Map(runs.map(run => [run.domainId, run]))

  return {
    generatedAt: now.toISOString(),
    availableClients,
    domains,
    runs,
    insights,
    coverage: {
      total: domains.length,
      active: domains.filter(domain => domain.status === 'active').length,
      paused: domains.filter(domain => domain.status === 'paused').length,
      neverRun: domains.filter(domain => !latestRun.has(domain.id)).length,
      blocked: domains.filter(domain => latestRun.get(domain.id)?.status === 'blocked').length,
      failed: domains.filter(domain => latestRun.get(domain.id)?.status === 'failed').length
    }
  }
}

export async function listSiteIntelligenceChangesRead(
  filters: SiteIntelligenceChangeReadFilters
): Promise<SiteIntelligenceChangeResponse> {
  const params: unknown[] = []
  const conditions = [
    ...readScopeSql(filters.clientIds, params, 'ch'),
    ...readDateSql(filters.range, params, 'ch', 'observed_at')
  ]
  if (filters.lane) {
    params.push(filters.lane)
    conditions.push(`ch.lane = $${params.length}`)
  }
  if (filters.changeType) {
    params.push(filters.changeType)
    conditions.push(`ch.change_type = $${params.length}`)
  }
  if (filters.cursor) {
    params.push(filters.cursor.observedAt, filters.cursor.id)
    conditions.push(`(ch.observed_at, ch.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`)
  }
  params.push(filters.limit + 1)
  const rows = await queryRows<SiteIntelligenceReadChangeRow>(`
    SELECT ch.id, ch.client_id, ch.domain_id, ch.page_id, ch.run_id,
           ch.lane, ch.change_type, ch.fact_diff, ch.source_url,
           ch.observed_at, ch.confidence, ch.review_status
    FROM site_intelligence_changes ch
    WHERE ${conditions.join(' AND ')}
    ORDER BY ch.observed_at DESC, ch.id DESC
    LIMIT $${params.length}
  `, params)
  const hasMore = rows.length > filters.limit
  const visible = rows.slice(0, filters.limit).map(mapReadChange)
  const last = visible.at(-1)
  return {
    generatedAt: new Date().toISOString(),
    rows: visible,
    pagination: {
      cursor: hasMore && last ? `${last.observedAt}|${last.id}` : null,
      hasMore
    }
  }
}

export async function getSiteIntelligenceGapsRead(
  filters: SiteIntelligenceReadFilters & { limit: number }
): Promise<SiteIntelligenceGapResponse> {
  const pages = await loadReadPages({ ...filters, lane: undefined })
  const now = new Date()
  const rows = Array.from(new Set(pages.map(page => page.clientId))).flatMap((clientId) => {
    const clientPages = pages.filter(page => page.clientId === clientId)
    const owned = clientPages.filter(page => page.lane === 'owned')
    const competitors = clientPages.filter(page => page.lane === 'competitor')
    const offerRows = compareAutomotiveOffers(owned, competitors, now)
      .filter(result => result.status !== 'matched')
      .map(result => ({
        key: result.key,
        type: 'offer' as const,
        status: result.status === 'gap' ? 'gap' as const : 'insufficient_data' as const,
        comparisonLevel: result.comparisonLevel,
        clientId,
        ownedPageId: result.ownedPageId,
        competitorPageIds: result.competitorPageIds,
        title: result.status === 'gap' ? 'Current competitor offer gap' : 'Offer comparison needs more evidence',
        explanation: result.explanation,
        confidence: result.confidence,
        evidenceUrls: result.evidenceUrls,
        observedAt: result.observedAt
      }))
    const contentRows = deriveSiteIntelligenceInsights({ clientId, pages: clientPages, now })
      .filter(insight => insight.type === 'content_gap')
      .map(insight => ({
        key: insight.id,
        type: 'content' as const,
        status: 'gap' as const,
        comparisonLevel: 'none' as const,
        clientId,
        ownedPageId: null,
        competitorPageIds: insight.evidencePageIds,
        title: insight.title,
        explanation: insight.summary,
        confidence: insight.confidence,
        evidenceUrls: insight.evidenceUrls,
        observedAt: insight.observedAt
      }))
    return [...offerRows, ...contentRows]
  })
    .sort((a, b) => b.confidence - a.confidence || b.observedAt.localeCompare(a.observedAt) || a.key.localeCompare(b.key))
    .slice(0, filters.limit)

  return { generatedAt: now.toISOString(), rows }
}

export async function getSiteIntelligenceRunRead(input: {
  clientIds: string[] | null
  runId: string
}): Promise<{ generatedAt: string, run: SiteIntelligenceRun, domain: SiteIntelligenceDomain, recentChanges: SiteIntelligenceChange[] } | null> {
  const params: unknown[] = [input.runId]
  const conditions = ['r.id = $1', ...readScopeSql(input.clientIds, params, 'r')]
  const row = await queryOne<SiteIntelligenceReadRunRow>(`
    SELECT r.id, r.client_id, r.domain_id, r.trigger, r.status,
           r.workflow_instance_id, r.cloudflare_job_id, r.settings,
           r.total_pages, r.completed_pages, r.changed_pages,
           r.disallowed_pages, r.errored_pages, r.browser_seconds,
           r.error_category, r.error_summary, r.requested_by,
           r.started_at, r.completed_at, r.created_at, r.updated_at
    FROM site_intelligence_crawl_runs r
    WHERE ${conditions.join(' AND ')}
    LIMIT 1
  `, params)
  if (!row) return null
  const domain = await getSiteIntelligenceDomainForActor(input.clientIds, row.domain_id)
  if (!domain) return null
  const changes = await queryRows<SiteIntelligenceReadChangeRow>(`
    SELECT ch.id, ch.client_id, ch.domain_id, ch.page_id, ch.run_id,
           ch.lane, ch.change_type, ch.fact_diff, ch.source_url,
           ch.observed_at, ch.confidence, ch.review_status
    FROM site_intelligence_changes ch
    WHERE ch.run_id = $1 AND ch.client_id = $2
    ORDER BY ch.observed_at DESC, ch.id DESC
    LIMIT 100
  `, [row.id, row.client_id])
  return {
    generatedAt: new Date().toISOString(),
    run: mapReadRun(row),
    domain,
    recentChanges: changes.map(mapReadChange)
  }
}
