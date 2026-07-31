import { createHash } from 'node:crypto'
import { queryRows, transaction } from '~~/server/utils/db'

export type SearchAuthorityOpportunityType
  = | 'low_ctr'
    | 'striking_distance'
    | 'declining'
    | 'growth'
    | 'indexing'
    | 'technical'

interface Metrics {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchAuthorityCandidate {
  clientId: string
  propertyMapId: string
  queryText: string | null
  pageUrl: string | null
  opportunityType: SearchAuthorityOpportunityType
  current: Metrics
  previous: Metrics | null
  coverageDays: number
  provisional: boolean
}

type RawCandidate = Omit<SearchAuthorityCandidate, 'opportunityType'>

export interface OpportunityReason {
  code: string
  observed: number | string | null
  expected: number | string | null
  contribution: number
}

export interface OpportunityScore {
  score: number
  confidence: number
  scoringVersion: 'gsc-v1'
  reasonCodes: OpportunityReason[]
}

interface ScoreConfig {
  minimumImpressions?: number
  ctrBaselines?: Array<{ maxPosition: number, ctr: number }>
}

interface OpportunityWindow {
  startDate: string
  endDate: string
}

interface UpsertOpportunityInput extends SearchAuthorityCandidate, OpportunityScore {
  fingerprint: string
  title: string
  summary: string
  evidenceStartDate: string
  evidenceEndDate: string
}

interface OpportunityDependencies {
  loadCandidates?: (
    clientId: string,
    window: OpportunityWindow
  ) => Promise<RawCandidate[]>
  upsertOpportunity?: (
    input: UpsertOpportunityInput
  ) => Promise<{ id: string, fingerprint: string }>
}

const DEFAULT_BASELINES = [
  { maxPosition: 3, ctr: 0.12 },
  { maxPosition: 5, ctr: 0.07 },
  { maxPosition: 10, ctr: 0.04 },
  { maxPosition: 20, ctr: 0.02 },
  { maxPosition: Number.POSITIVE_INFINITY, ctr: 0.01 }
]

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100
}

function baselineCtr(position: number, config: ScoreConfig): number {
  const baselines = config.ctrBaselines ?? DEFAULT_BASELINES
  return baselines.find(band => position <= band.maxPosition)?.ctr ?? 0.01
}

function materialContribution(impressions: number): number {
  return Math.min(25, Math.log10(Math.max(1, impressions) + 1) * 6.25)
}

function relativeChange(current: number, previous: number): number {
  if (previous > 0) return (current - previous) / previous
  return current > 0 ? 1 : 0
}

export function scoreSearchAuthorityCandidate(
  candidate: SearchAuthorityCandidate,
  config: ScoreConfig = {}
): OpportunityScore {
  const reasons: OpportunityReason[] = []
  const minimumImpressions = config.minimumImpressions ?? 100

  if (candidate.opportunityType === 'low_ctr') {
    const expected = baselineCtr(candidate.current.position, config)
    const gap = expected > 0
      ? Math.max(0, (expected - candidate.current.ctr) / expected)
      : 0
    if (
      candidate.current.impressions >= minimumImpressions
      && gap > 0
    ) {
      reasons.push({
        code: 'ctr_below_position_baseline',
        observed: candidate.current.ctr,
        expected,
        contribution: 15 + gap * 55
      })
      reasons.push({
        code: 'material_impressions',
        observed: candidate.current.impressions,
        expected: minimumImpressions,
        contribution: materialContribution(candidate.current.impressions)
      })
    }
  } else if (candidate.opportunityType === 'striking_distance') {
    if (
      candidate.current.position >= 4
      && candidate.current.position <= 15
      && candidate.current.impressions >= minimumImpressions
    ) {
      reasons.push({
        code: 'ranking_within_striking_distance',
        observed: candidate.current.position,
        expected: '4-15',
        contribution: 55 + Math.max(0, 15 - candidate.current.position) * 2
      })
      reasons.push({
        code: 'material_impressions',
        observed: candidate.current.impressions,
        expected: minimumImpressions,
        contribution: materialContribution(candidate.current.impressions)
      })
    }
  } else if (
    candidate.opportunityType === 'declining'
    || candidate.opportunityType === 'growth'
  ) {
    const clickChange = relativeChange(
      candidate.current.clicks,
      candidate.previous?.clicks ?? 0
    )
    const impressionChange = relativeChange(
      candidate.current.impressions,
      candidate.previous?.impressions ?? 0
    )
    const threshold = candidate.opportunityType === 'declining'
      ? (change: number) => change <= -0.2
      : (change: number) => change >= 0.2
    const hasMaterialImpressions = Math.max(
      candidate.current.impressions,
      candidate.previous?.impressions ?? 0
    ) >= minimumImpressions
    const changes = hasMaterialImpressions
      ? [
          { metric: 'clicks', value: clickChange },
          { metric: 'impressions', value: impressionChange }
        ].filter(change => threshold(change.value))
      : []
    for (const change of changes) {
      reasons.push({
        code: candidate.opportunityType === 'declining'
          ? `${change.metric}_declined`
          : `${change.metric}_grew`,
        observed: Math.round(change.value * 1000) / 10,
        expected: candidate.opportunityType === 'declining' ? '<= -20%' : '>= 20%',
        contribution: 35 + Math.min(30, Math.abs(change.value) * 40)
      })
    }
    if (changes.length > 0) {
      reasons.push({
        code: 'current_click_volume',
        observed: candidate.current.clicks,
        expected: candidate.previous?.clicks ?? null,
        contribution: Math.min(10, Math.log10(candidate.current.clicks + 1) * 5)
      })
    }
  } else {
    reasons.push({
      code: candidate.opportunityType === 'indexing'
        ? 'indexing_finding'
        : 'technical_finding',
      observed: candidate.pageUrl,
      expected: 'healthy',
      contribution: 70
    })
  }

  let confidence = 1
  if (candidate.provisional) {
    confidence -= 0.25
    reasons.push({
      code: 'provider_data_provisional',
      observed: 'provisional',
      expected: 'final',
      contribution: 0
    })
  }
  if (candidate.coverageDays < 28) {
    confidence -= 0.2
    reasons.push({
      code: 'incomplete_evidence_window',
      observed: candidate.coverageDays,
      expected: 28,
      contribution: 0
    })
  }
  if (
    ['declining', 'growth'].includes(candidate.opportunityType)
    && !candidate.previous
  ) {
    confidence -= 0.3
    reasons.push({
      code: 'missing_comparison_window',
      observed: null,
      expected: 28,
      contribution: 0
    })
  }

  return {
    score: clampScore(reasons.reduce((sum, reason) => sum + reason.contribution, 0)),
    confidence: roundConfidence(confidence),
    scoringVersion: 'gsc-v1',
    reasonCodes: reasons.map(reason => ({
      ...reason,
      contribution: Math.round(reason.contribution * 10) / 10
    }))
  }
}

function normalizedUrl(value: string | null): string {
  if (!value) return ''
  try {
    const url = new URL(value.trim())
    url.protocol = url.protocol.toLowerCase()
    url.hostname = url.hostname.toLowerCase()
    url.hash = ''
    return url.toString()
  } catch {
    return value.trim().toLowerCase()
  }
}

export function searchAuthorityFingerprint(
  opportunityType: SearchAuthorityOpportunityType,
  queryText: string | null,
  pageUrl: string | null
): string {
  const query = (queryText ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return createHash('sha256')
    .update(`${opportunityType}\u0000${query}\u0000${normalizedUrl(pageUrl)}`)
    .digest('hex')
}

function previousWindow(window: OpportunityWindow): OpportunityWindow {
  const start = new Date(`${window.startDate}T00:00:00.000Z`)
  const end = new Date(`${window.endDate}T00:00:00.000Z`)
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  const previousEnd = new Date(start)
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1)
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10)
  }
}

async function defaultLoadCandidates(
  clientId: string,
  window: OpportunityWindow
): Promise<RawCandidate[]> {
  const previous = previousWindow(window)
  const rows = await queryRows<{
    property_map_id: string
    query_text: string
    page_url: string
    current_clicks: string
    current_impressions: string
    current_ctr: string
    current_position: string
    previous_clicks: string
    previous_impressions: string
    previous_ctr: string
    previous_position: string
    coverage_days: string
    previous_coverage_days: string
    provisional: boolean
  }>(
    `WITH coverage AS (
       SELECT
         property_map_id,
         COUNT(DISTINCT metric_date) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ) AS coverage_days,
         COUNT(DISTINCT metric_date) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ) AS previous_coverage_days,
         BOOL_OR(provisional) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ) AS provisional
       FROM gsc_daily_property
       WHERE client_id = $1
         AND search_type = 'web'
         AND metric_date BETWEEN $4::date AND $3::date
       GROUP BY property_map_id
     ),
     query_page AS (
       SELECT
         property_map_id,
         query_text,
         page_url,
         COALESCE(SUM(clicks) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ), 0) AS current_clicks,
         COALESCE(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ), 0) AS current_impressions,
         COALESCE((SUM(clicks) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ))::numeric / NULLIF(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ), 0), 0) AS current_ctr,
         COALESCE(SUM(position * impressions) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ) / NULLIF(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $2::date AND $3::date
         ), 0), 0) AS current_position,
         COALESCE(SUM(clicks) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ), 0) AS previous_clicks,
         COALESCE(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ), 0) AS previous_impressions,
         COALESCE((SUM(clicks) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ))::numeric / NULLIF(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ), 0), 0) AS previous_ctr,
         COALESCE(SUM(position * impressions) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ) / NULLIF(SUM(impressions) FILTER (
           WHERE metric_date BETWEEN $4::date AND $5::date
         ), 0), 0) AS previous_position
       FROM gsc_daily_query_page
       WHERE client_id = $1
         AND search_type = 'web'
         AND metric_date BETWEEN $4::date AND $3::date
       GROUP BY property_map_id, query_text, page_url
     )
     SELECT
       query_page.*,
       COALESCE(coverage.coverage_days, 0) AS coverage_days,
       COALESCE(coverage.previous_coverage_days, 0) AS previous_coverage_days,
       COALESCE(coverage.provisional, FALSE) AS provisional
     FROM query_page
     LEFT JOIN coverage USING (property_map_id)`,
    [
      clientId,
      window.startDate,
      window.endDate,
      previous.startDate,
      previous.endDate
    ]
  )
  return rows.map(row => ({
    clientId,
    propertyMapId: row.property_map_id,
    queryText: row.query_text,
    pageUrl: row.page_url,
    current: {
      clicks: Number(row.current_clicks),
      impressions: Number(row.current_impressions),
      ctr: Number(row.current_ctr),
      position: Number(row.current_position)
    },
    previous: Number(row.previous_coverage_days) >= 28
      ? {
          clicks: Number(row.previous_clicks),
          impressions: Number(row.previous_impressions),
          ctr: Number(row.previous_ctr),
          position: Number(row.previous_position)
        }
      : null,
    coverageDays: Number(row.coverage_days),
    provisional: Boolean(row.provisional)
  }))
}

function titleFor(candidate: SearchAuthorityCandidate): string {
  const subject = candidate.queryText || candidate.pageUrl || 'Search opportunity'
  const prefixes: Record<SearchAuthorityOpportunityType, string> = {
    low_ctr: 'Improve search click-through',
    striking_distance: 'Move a ranking into the top results',
    declining: 'Recover declining search demand',
    growth: 'Protect growing search demand',
    indexing: 'Resolve an indexing finding',
    technical: 'Resolve a technical search finding'
  }
  return `${prefixes[candidate.opportunityType]}: ${subject}`.slice(0, 500)
}

async function defaultUpsertOpportunity(
  input: UpsertOpportunityInput
): Promise<{ id: string, fingerprint: string }> {
  return transaction(async (db) => {
    const result = await db.query<{ id: string, fingerprint: string }>(
      `INSERT INTO search_authority_opportunities (
         client_id, site_id, property_map_id, opportunity_type,
         fingerprint, query_text, page_url, title, summary,
         score, confidence, scoring_version, reason_codes,
         evidence_start_date, evidence_end_date
       )
       SELECT
         $1, map.site_id, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12::jsonb, $13, $14
       FROM search_console_property_maps map
       WHERE map.client_id = $1 AND map.id = $2
       ON CONFLICT (site_id, fingerprint)
       DO UPDATE SET
         score = EXCLUDED.score,
         confidence = EXCLUDED.confidence,
         scoring_version = EXCLUDED.scoring_version,
         reason_codes = EXCLUDED.reason_codes,
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         evidence_start_date = EXCLUDED.evidence_start_date,
         evidence_end_date = EXCLUDED.evidence_end_date,
         last_detected_at = NOW(),
         updated_at = NOW()
       RETURNING id, fingerprint`,
      [
        input.clientId,
        input.propertyMapId,
        input.opportunityType,
        input.fingerprint,
        input.queryText,
        input.pageUrl,
        input.title,
        input.summary,
        input.score,
        input.confidence,
        input.scoringVersion,
        JSON.stringify(input.reasonCodes),
        input.evidenceStartDate,
        input.evidenceEndDate
      ]
    )
    const opportunity = result.rows[0]
    if (!opportunity) throw new Error('Opportunity property map was not found')
    await db.query(
      `INSERT INTO search_authority_opportunity_evidence (
         client_id, opportunity_id, evidence_type,
         window_start_date, window_end_date, snapshot, provider_metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        input.clientId,
        opportunity.id,
        `gsc_${input.opportunityType}`,
        input.evidenceStartDate,
        input.evidenceEndDate,
        JSON.stringify({
          current: input.current,
          previous: input.previous,
          queryText: input.queryText,
          pageUrl: input.pageUrl
        }),
        JSON.stringify({
          provisional: input.provisional,
          coverageDays: input.coverageDays,
          scoringVersion: input.scoringVersion
        })
      ]
    )
    return opportunity
  })
}

export async function generateSearchAuthorityOpportunities(
  clientId: string,
  window: OpportunityWindow,
  dependencies: OpportunityDependencies = {}
): Promise<{ generated: number, fingerprints: string[] }> {
  const rows = await (dependencies.loadCandidates
    ?? defaultLoadCandidates)(clientId, window)
  const upsert = dependencies.upsertOpportunity ?? defaultUpsertOpportunity
  const fingerprints: string[] = []

  for (const row of rows) {
    const opportunityTypes: SearchAuthorityOpportunityType[] = [
      'low_ctr',
      'striking_distance',
      'declining',
      'growth'
    ]
    for (const opportunityType of opportunityTypes) {
      const candidate: SearchAuthorityCandidate = { ...row, opportunityType }
      const scored = scoreSearchAuthorityCandidate(candidate)
      if (scored.score === 0) continue
      const fingerprint = searchAuthorityFingerprint(
        opportunityType,
        row.queryText,
        row.pageUrl
      )
      await upsert({
        ...candidate,
        ...scored,
        fingerprint,
        title: titleFor(candidate),
        summary: scored.reasonCodes
          .filter(reason => reason.contribution > 0)
          .map(reason => reason.code.replaceAll('_', ' '))
          .join('; '),
        evidenceStartDate: window.startDate,
        evidenceEndDate: window.endDate
      })
      fingerprints.push(fingerprint)
    }
  }
  return { generated: fingerprints.length, fingerprints }
}
