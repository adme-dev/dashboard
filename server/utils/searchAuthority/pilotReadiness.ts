import { queryOne } from '~~/server/utils/db'

export type SearchAuthorityPilotGateState
  = 'ready' | 'blocked' | 'unavailable' | 'not_started'

export type SearchAuthorityPilotGateKey
  = | 'site'
    | 'searchConsole'
    | 'ownedCollection'
    | 'competitorCollection'
    | 'contentPublisher'
    | 'googleBusiness'

export interface SearchAuthorityPilotGate {
  state: SearchAuthorityPilotGateState
  reasonCode: string | null
  action: string | null
  evidenceAt: string | null
}

export interface SearchAuthorityPilotReadiness {
  clientId: string
  coreReady: boolean
  gates: Record<SearchAuthorityPilotGateKey, SearchAuthorityPilotGate>
}

export interface SearchAuthorityPilotReadinessSnapshot {
  siteId: string | null
  siteStatus: string | null
  canonicalHostname: string | null
  contentHostname: string | null
  activeConnectionCount: number
  activePropertyMapCount: number
  baselineCompletedAt: string | null
  dataThroughDate: string | null
  ownedDomainCount: number
  competitorDomainCount: number
  latestOwnedRunStatus: string | null
  latestOwnedRunPages: number
  latestOwnedRunAt: string | null
  latestOwnedRunErrorCategory: string | null
  latestCompetitorRunStatus: string | null
  latestCompetitorRunPages: number
  latestCompetitorRunAt: string | null
  latestCompetitorRunErrorCategory: string | null
  activeGoogleBusinessCount: number
  healthyGoogleBusinessCount: number
}

interface SearchAuthorityPilotReadinessRow {
  site_id: string | null
  site_status: string | null
  canonical_hostname: string | null
  content_hostname: string | null
  active_connection_count: string | number
  active_property_map_count: string | number
  baseline_completed_at: Date | string | null
  data_through_date: Date | string | null
  owned_domain_count: string | number
  competitor_domain_count: string | number
  latest_owned_run_status: string | null
  latest_owned_run_pages: string | number | null
  latest_owned_run_at: Date | string | null
  latest_owned_run_error_category: string | null
  latest_competitor_run_status: string | null
  latest_competitor_run_pages: string | number | null
  latest_competitor_run_at: Date | string | null
  latest_competitor_run_error_category: string | null
  active_google_business_count: string | number
  healthy_google_business_count: string | number
}

export interface SearchAuthorityPilotReadinessDependencies {
  querySnapshot?: (clientId: string) => Promise<SearchAuthorityPilotReadinessRow | null>
}

function gate(
  state: SearchAuthorityPilotGateState,
  reasonCode: string | null,
  action: string | null,
  evidenceAt: string | null = null
): SearchAuthorityPilotGate {
  return { state, reasonCode, action, evidenceAt }
}

function collectionGate(
  lane: 'owned' | 'competitor',
  domainCount: number,
  status: string | null,
  pages: number,
  evidenceAt: string | null,
  errorCategory: string | null
): SearchAuthorityPilotGate {
  if (domainCount === 0) {
    return gate(
      'not_started',
      `${lane}_domain_not_configured`,
      `Configure the approved ${lane} monitoring boundary.`
    )
  }

  if (!status) {
    return gate(
      'not_started',
      `${lane}_crawl_not_run`,
      `Run the approved ${lane} domain manually.`
    )
  }

  if (['completed', 'partial'].includes(status) && pages > 0) {
    return gate('ready', null, null, evidenceAt)
  }

  const browserFailure = errorCategory === 'browser_run'
  return gate(
    'blocked',
    browserFailure ? 'browser_rendering_failed' : `${lane}_crawl_not_successful`,
    browserFailure
      ? 'Restore Browser Rendering readiness before retrying the crawl.'
      : `Review the latest ${lane} crawl diagnostics before retrying.`,
    evidenceAt
  )
}

export function deriveSearchAuthorityPilotReadiness(
  clientId: string,
  snapshot: SearchAuthorityPilotReadinessSnapshot
): SearchAuthorityPilotReadiness {
  const site = snapshot.siteId && snapshot.siteStatus === 'active'
    ? gate('ready', null, null)
    : gate(
        'not_started',
        'search_authority_site_not_active',
        'Configure and activate the client Search Authority site.'
      )

  let searchConsole: SearchAuthorityPilotGate
  if (snapshot.activeConnectionCount === 0) {
    searchConsole = gate(
      'not_started',
      'search_console_not_connected',
      'Connect an authorised read-only Search Console identity.'
    )
  } else if (snapshot.activePropertyMapCount === 0) {
    searchConsole = gate(
      'blocked',
      'search_console_property_not_mapped',
      'Map one verified Search Console property for the client.'
    )
  } else if (!snapshot.baselineCompletedAt || !snapshot.dataThroughDate) {
    searchConsole = gate(
      'blocked',
      'search_console_baseline_incomplete',
      'Continue the resumable Search Console baseline until it completes.',
      snapshot.baselineCompletedAt
    )
  } else {
    searchConsole = gate('ready', null, null, snapshot.baselineCompletedAt)
  }

  const ownedCollection = collectionGate(
    'owned',
    snapshot.ownedDomainCount,
    snapshot.latestOwnedRunStatus,
    snapshot.latestOwnedRunPages,
    snapshot.latestOwnedRunAt,
    snapshot.latestOwnedRunErrorCategory
  )
  const competitorCollection = collectionGate(
    'competitor',
    snapshot.competitorDomainCount,
    snapshot.latestCompetitorRunStatus,
    snapshot.latestCompetitorRunPages,
    snapshot.latestCompetitorRunAt,
    snapshot.latestCompetitorRunErrorCategory
  )

  const contentPublisher = snapshot.contentHostname
    ? gate(
        'blocked',
        'content_publisher_not_verified',
        'Publish and verify one approved guide on the configured content hostname.'
      )
    : gate(
        'not_started',
        'content_hostname_not_configured',
        'Configure the approved XeroFlow content hostname.'
      )

  const googleBusiness = snapshot.activeGoogleBusinessCount === 0
    ? gate(
        'unavailable',
        'google_business_not_connected',
        'Confirm Google production access before connecting the Knox location.'
      )
    : snapshot.healthyGoogleBusinessCount > 0
      ? gate('ready', null, null)
      : gate(
          'blocked',
          'google_business_connection_unhealthy',
          'Reconnect or repair the Knox Google Business location.'
        )

  const gates = {
    site,
    searchConsole,
    ownedCollection,
    competitorCollection,
    contentPublisher,
    googleBusiness
  }
  const coreReady = [
    site,
    searchConsole,
    ownedCollection,
    competitorCollection,
    contentPublisher
  ].every(candidate => candidate.state === 'ready')

  return { clientId, coreReady, gates }
}

function dateValue(value: Date | string | null): string | null {
  if (value === null) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

export async function getSearchAuthorityPilotReadiness(
  clientId: string,
  dependencies: SearchAuthorityPilotReadinessDependencies = {}
): Promise<SearchAuthorityPilotReadiness> {
  const querySnapshot = dependencies.querySnapshot
    ?? ((id: string) => queryOne<SearchAuthorityPilotReadinessRow>(
      `SELECT
         site.id AS site_id,
         site.status AS site_status,
         site.canonical_hostname,
         site.content_hostname,
         (
           SELECT COUNT(*)
           FROM search_console_connections connection
           WHERE connection.client_id = $1
             AND connection.status = 'active'
         ) AS active_connection_count,
         (
           SELECT COUNT(*)
           FROM search_console_property_maps map
           WHERE map.client_id = $1
             AND map.status IN ('active', 'restricted')
         ) AS active_property_map_count,
         (
           SELECT MAX(map.baseline_completed_at)
           FROM search_console_property_maps map
           WHERE map.client_id = $1
             AND map.status IN ('active', 'restricted')
         ) AS baseline_completed_at,
         (
           SELECT MAX(map.data_through_date)
           FROM search_console_property_maps map
           WHERE map.client_id = $1
             AND map.status IN ('active', 'restricted')
         ) AS data_through_date,
         (
           SELECT COUNT(*)
           FROM site_intelligence_domains domain
           WHERE domain.client_id = $1
             AND domain.lane = 'owned'
             AND domain.status = 'active'
         ) AS owned_domain_count,
         (
           SELECT COUNT(*)
           FROM site_intelligence_domains domain
           WHERE domain.client_id = $1
             AND domain.lane = 'competitor'
             AND domain.status = 'active'
         ) AS competitor_domain_count,
         owned.status AS latest_owned_run_status,
         owned.completed_pages AS latest_owned_run_pages,
         owned.evidence_at AS latest_owned_run_at,
         owned.error_category AS latest_owned_run_error_category,
         competitor.status AS latest_competitor_run_status,
         competitor.completed_pages AS latest_competitor_run_pages,
         competitor.evidence_at AS latest_competitor_run_at,
         competitor.error_category AS latest_competitor_run_error_category,
         (
           SELECT COUNT(*)
           FROM social_accounts account
           WHERE account.client_id = $1
             AND account.platform = 'google-business'
             AND account.is_active IS TRUE
         ) AS active_google_business_count,
         (
           SELECT COUNT(*)
           FROM social_accounts account
           WHERE account.client_id = $1
             AND account.platform = 'google-business'
             AND account.is_active IS TRUE
             AND account.last_error IS NULL
         ) AS healthy_google_business_count
       FROM (SELECT $1::uuid AS client_id) selected
       LEFT JOIN search_authority_sites site
         ON site.client_id = selected.client_id
       LEFT JOIN LATERAL (
         SELECT run.status, run.completed_pages, run.error_category,
                COALESCE(run.completed_at, run.updated_at, run.created_at) AS evidence_at
         FROM site_intelligence_crawl_runs run
         JOIN site_intelligence_domains domain
           ON domain.id = run.domain_id
          AND domain.client_id = run.client_id
         WHERE run.client_id = selected.client_id
           AND domain.lane = 'owned'
         ORDER BY run.created_at DESC
         LIMIT 1
       ) owned ON TRUE
       LEFT JOIN LATERAL (
         SELECT run.status, run.completed_pages, run.error_category,
                COALESCE(run.completed_at, run.updated_at, run.created_at) AS evidence_at
         FROM site_intelligence_crawl_runs run
         JOIN site_intelligence_domains domain
           ON domain.id = run.domain_id
          AND domain.client_id = run.client_id
         WHERE run.client_id = selected.client_id
           AND domain.lane = 'competitor'
         ORDER BY run.created_at DESC
         LIMIT 1
       ) competitor ON TRUE
       LIMIT 1`,
      [id]
    ))

  const row = await querySnapshot(clientId)
  return deriveSearchAuthorityPilotReadiness(clientId, {
    siteId: row?.site_id ?? null,
    siteStatus: row?.site_status ?? null,
    canonicalHostname: row?.canonical_hostname ?? null,
    contentHostname: row?.content_hostname ?? null,
    activeConnectionCount: Number(row?.active_connection_count ?? 0),
    activePropertyMapCount: Number(row?.active_property_map_count ?? 0),
    baselineCompletedAt: dateValue(row?.baseline_completed_at ?? null),
    dataThroughDate: dateValue(row?.data_through_date ?? null),
    ownedDomainCount: Number(row?.owned_domain_count ?? 0),
    competitorDomainCount: Number(row?.competitor_domain_count ?? 0),
    latestOwnedRunStatus: row?.latest_owned_run_status ?? null,
    latestOwnedRunPages: Number(row?.latest_owned_run_pages ?? 0),
    latestOwnedRunAt: dateValue(row?.latest_owned_run_at ?? null),
    latestOwnedRunErrorCategory: row?.latest_owned_run_error_category ?? null,
    latestCompetitorRunStatus: row?.latest_competitor_run_status ?? null,
    latestCompetitorRunPages: Number(row?.latest_competitor_run_pages ?? 0),
    latestCompetitorRunAt: dateValue(row?.latest_competitor_run_at ?? null),
    latestCompetitorRunErrorCategory: row?.latest_competitor_run_error_category ?? null,
    activeGoogleBusinessCount: Number(row?.active_google_business_count ?? 0),
    healthyGoogleBusinessCount: Number(row?.healthy_google_business_count ?? 0)
  })
}
