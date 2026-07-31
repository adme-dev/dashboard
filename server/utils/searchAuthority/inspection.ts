import { execute, queryRows } from '~~/server/utils/db'
import {
  refreshSearchConsoleCredential,
  resolveSearchConsoleCredential,
  type ResolvedSearchConsoleCredential
} from '~~/server/utils/searchAuthority/credentials'
import {
  inspectSearchConsoleUrl,
  type SearchConsoleInspection
} from '~~/server/utils/searchAuthority/googleClient'

interface RawInspectionCandidate {
  property_map_id: string
  connection_id: string
  property_uri: string
  inspected_url: string
  priority_tier: number
  priority_score: number
  last_inspected_at?: Date | string | null
}

export interface InspectionCandidate {
  propertyMapId: string
  connectionId: string
  propertyUri: string
  inspectedUrl: string
  priorityTier: number
  priorityScore: number
}

interface PersistInspectionInput extends SearchConsoleInspection {
  clientId: string
  propertyMapId: string
  inspectedUrl: string
}

interface InspectionDependencies {
  now?: () => Date
  loadCandidates?: (
    clientId: string
  ) => Promise<RawInspectionCandidate[]>
  selectCandidates?: (
    clientId: string,
    limit: number
  ) => Promise<InspectionCandidate[]>
  resolveCredential?: typeof resolveSearchConsoleCredential
  refreshCredential?: typeof refreshSearchConsoleCredential
  inspectUrl?: typeof inspectSearchConsoleUrl
  persistInspection?: (input: PersistInspectionInput) => Promise<void>
}

const MAX_INSPECTIONS_PER_CLIENT = 50
const REFRESH_SKEW_MS = 5 * 60 * 1000

async function defaultLoadCandidates(
  clientId: string
): Promise<RawInspectionCandidate[]> {
  return queryRows<RawInspectionCandidate>(
    `WITH mapped AS (
       SELECT
         map.id AS property_map_id,
         map.connection_id,
         map.property_uri,
         site.canonical_hostname
       FROM search_console_property_maps map
       JOIN search_authority_sites site
         ON site.client_id = map.client_id
        AND site.id = map.site_id
        AND site.status = 'active'
       WHERE map.client_id = $1
         AND map.status IN ('active', 'restricted')
     ),
     candidates AS (
       SELECT
         mapped.property_map_id,
         mapped.connection_id,
         mapped.property_uri,
         opportunity.page_url AS inspected_url,
         1 AS priority_tier,
         opportunity.score AS priority_score
       FROM mapped
       JOIN search_authority_opportunities opportunity
         ON opportunity.client_id = $1
        AND opportunity.property_map_id = mapped.property_map_id
       WHERE opportunity.page_url IS NOT NULL
         AND opportunity.lifecycle_status IN ('published', 'measuring')
         AND opportunity.updated_at >= NOW() - INTERVAL '30 days'

       UNION ALL

       SELECT
         mapped.property_map_id,
         mapped.connection_id,
         mapped.property_uri,
         opportunity.page_url,
         2,
         opportunity.score
       FROM mapped
       JOIN search_authority_opportunities opportunity
         ON opportunity.client_id = $1
        AND opportunity.property_map_id = mapped.property_map_id
       WHERE opportunity.page_url IS NOT NULL
         AND opportunity.score >= 60
         AND opportunity.lifecycle_status NOT IN (
           'closed', 'dismissed', 'duplicate', 'expired', 'not_actionable'
         )

       UNION ALL

       SELECT
         mapped.property_map_id,
         mapped.connection_id,
         mapped.property_uri,
         'https://' || mapped.canonical_hostname || '/',
         3,
         0
       FROM mapped

       UNION ALL

       SELECT
         mapped.property_map_id,
         mapped.connection_id,
         mapped.property_uri,
         page.page_url,
         4,
         MAX(page.impressions)::integer
       FROM mapped
       JOIN gsc_daily_page page
         ON page.client_id = $1
        AND page.property_map_id = mapped.property_map_id
        AND page.metric_date >= CURRENT_DATE - 28
       WHERE page.page_url ~* '/(stock|vehicle|vehicles|inventory|new|used|cars)/'
       GROUP BY
         mapped.property_map_id,
         mapped.connection_id,
         mapped.property_uri,
         page.page_url
     )
     SELECT
       candidate.property_map_id,
       candidate.connection_id,
       candidate.property_uri,
       candidate.inspected_url,
       candidate.priority_tier,
       candidate.priority_score,
       latest.inspected_at AS last_inspected_at
     FROM candidates candidate
     LEFT JOIN LATERAL (
       SELECT inspection.inspected_at
       FROM gsc_url_inspections inspection
       WHERE inspection.property_map_id = candidate.property_map_id
         AND inspection.inspected_url = candidate.inspected_url
       ORDER BY inspection.inspected_at DESC
       LIMIT 1
     ) latest ON TRUE
     WHERE candidate.inspected_url ~ '^https?://'
     ORDER BY
       candidate.priority_tier,
       latest.inspected_at ASC NULLS FIRST,
       candidate.priority_score DESC`,
    [clientId]
  )
}

export async function selectInspectionCandidates(
  clientId: string,
  limit = MAX_INSPECTIONS_PER_CLIENT,
  dependencies: InspectionDependencies = {}
): Promise<InspectionCandidate[]> {
  const cappedLimit = Math.max(
    0,
    Math.min(Math.floor(limit), MAX_INSPECTIONS_PER_CLIENT)
  )
  if (cappedLimit === 0) return []
  const rows = await (dependencies.loadCandidates
    ?? defaultLoadCandidates)(clientId)
  const seen = new Set<string>()

  return rows
    .sort((left, right) => {
      const tierOrder = left.priority_tier - right.priority_tier
      if (tierOrder !== 0) return tierOrder
      const leftInspected = left.last_inspected_at
        ? new Date(left.last_inspected_at).getTime()
        : null
      const rightInspected = right.last_inspected_at
        ? new Date(right.last_inspected_at).getTime()
        : null
      if (leftInspected === null && rightInspected !== null) return -1
      if (leftInspected !== null && rightInspected === null) return 1
      if (
        leftInspected !== null
        && rightInspected !== null
        && leftInspected !== rightInspected
      ) {
        return leftInspected - rightInspected
      }
      return right.priority_score - left.priority_score
    })
    .filter((row) => {
      const key = `${row.property_map_id}\u0000${row.inspected_url}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, cappedLimit)
    .map(row => ({
      propertyMapId: row.property_map_id,
      connectionId: row.connection_id,
      propertyUri: row.property_uri,
      inspectedUrl: row.inspected_url,
      priorityTier: row.priority_tier,
      priorityScore: row.priority_score
    }))
}

function needsRefresh(
  credential: ResolvedSearchConsoleCredential,
  now: Date
): boolean {
  return Boolean(
    credential.tokenExpiresAt
    && new Date(credential.tokenExpiresAt).getTime()
    <= now.getTime() + REFRESH_SKEW_MS
  )
}

function isQuotaFailure(error: unknown): boolean {
  const candidate = error as {
    statusCode?: number
    status?: number
    message?: string
  }
  const status = candidate?.statusCode ?? candidate?.status
  return status === 429 || /quota|rate limit/i.test(candidate?.message || '')
}

async function defaultPersistInspection(
  input: PersistInspectionInput
): Promise<void> {
  await execute(
    `INSERT INTO gsc_url_inspections (
       client_id, property_map_id, inspected_url, inspection_kind,
       verdict, coverage_state, indexing_state, page_fetch_state,
       robots_txt_state, crawled_as, last_crawl_time,
       google_canonical, user_canonical, referring_urls, sitemap_urls,
       provider_result, inspected_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       $12, $13, $14::jsonb, $15::jsonb, $16::jsonb, NOW()
     )`,
    [
      input.clientId,
      input.propertyMapId,
      input.inspectedUrl,
      input.inspectionKind,
      input.verdict,
      input.coverageState,
      input.indexingState,
      input.pageFetchState,
      input.robotsTxtState,
      input.crawledAs,
      input.lastCrawlTime,
      input.googleCanonical,
      input.userCanonical,
      JSON.stringify(input.referringUrls),
      JSON.stringify(input.sitemapUrls),
      JSON.stringify({
        ...input.providerResult,
        inspectionResultLink: input.inspectionResultLink
      })
    ]
  )
}

export async function inspectPriorityUrls(
  clientId: string,
  limit = MAX_INSPECTIONS_PER_CLIENT,
  dependencies: InspectionDependencies = {}
): Promise<{
  inspected: number
  failed: number
  errors: Array<{ url: string, message: string }>
}> {
  const candidates = await (dependencies.selectCandidates
    ?? ((id, candidateLimit) => selectInspectionCandidates(
      id,
      candidateLimit,
      dependencies
    )))(clientId, limit)
  const credentialCache = new Map<string, ResolvedSearchConsoleCredential>()
  const errors: Array<{ url: string, message: string }> = []
  let inspected = 0
  const now = (dependencies.now ?? (() => new Date()))()

  for (const candidate of candidates.slice(0, MAX_INSPECTIONS_PER_CLIENT)) {
    try {
      let credential = credentialCache.get(candidate.connectionId)
      if (!credential) {
        credential = await (dependencies.resolveCredential
          ?? resolveSearchConsoleCredential)(candidate.connectionId)
        if (needsRefresh(credential, now)) {
          credential = await (dependencies.refreshCredential
            ?? refreshSearchConsoleCredential)(candidate.connectionId)
        }
        credentialCache.set(candidate.connectionId, credential)
      }
      const result = await (dependencies.inspectUrl
        ?? inspectSearchConsoleUrl)(
        credential.accessToken,
        candidate.propertyUri,
        candidate.inspectedUrl
      )
      await (dependencies.persistInspection ?? defaultPersistInspection)({
        ...result,
        clientId,
        propertyMapId: candidate.propertyMapId,
        inspectedUrl: candidate.inspectedUrl
      })
      inspected += 1
    } catch (error: unknown) {
      errors.push({
        url: candidate.inspectedUrl,
        message: error instanceof Error ? error.message : 'Inspection failed'
      })
      if (isQuotaFailure(error)) break
    }
  }

  return {
    inspected,
    failed: errors.length,
    errors
  }
}
