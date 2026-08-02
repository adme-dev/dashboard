import type {
  ClientMarketLocation,
  NearbyMarketRadius,
  SiteIntelligenceCandidateSource,
  SiteIntelligenceCandidateState
} from '~~/app/types/site-intelligence'
import { queryOne, queryRows } from '~~/server/utils/db'

export interface NearbyMarketExecutor {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
}

interface ClientMarketLocationRow {
  id: string
  client_id: string
  label: string
  address_text: string
  google_place_id: string
  is_primary: boolean
  confirmed_at: string | Date
  confirmed_by: string | null
  created_at: string | Date
  updated_at: string | Date
}

interface SiteIntelligenceCandidateRow {
  id: string
  client_id: string
  market_location_id: string
  google_place_id: string
  state: SiteIntelligenceCandidateState
  source: SiteIntelligenceCandidateSource
  approved_domain_id: string | null
  radius_km_at_decision: number | string
  nomination_reason: string | null
  nominated_at: string | Date | null
  nominated_by_client_user_id: string | null
  agency_review_reason: string | null
  reviewed_at: string | Date | null
  reviewed_by_user_id: string | null
  created_at: string | Date
  updated_at: string | Date
}

export interface PersistedNearbyMarketCandidate {
  id: string
  clientId: string
  marketLocationId: string
  googlePlaceId: string
  state: SiteIntelligenceCandidateState
  source: SiteIntelligenceCandidateSource
  approvedDomainId: string | null
  radiusKmAtDecision: NearbyMarketRadius
  nominationReason: string | null
  nominatedAt: string | null
  nominatedByClientUserId: string | null
  agencyReviewReason: string | null
  reviewedAt: string | null
  reviewedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertPrimaryMarketLocationInput {
  label: string
  addressText: string
  googlePlaceId: string
  confirmedBy: string | null
}

export interface UpsertNearbyMarketCandidateInput {
  marketLocationId: string
  googlePlaceId: string
  state: SiteIntelligenceCandidateState
  source: SiteIntelligenceCandidateSource
  approvedDomainId: string | null
  radiusKmAtDecision: NearbyMarketRadius
  nominationReason: string | null
  nominatedAt: string | null
  nominatedByClientUserId: string | null
  agencyReviewReason: string | null
  reviewedAt: string | null
  reviewedByUserId: string | null
}

export interface NominateNearbyMarketCandidateInput {
  marketLocationId: string
  googlePlaceId: string
  radiusKmAtDecision: NearbyMarketRadius
  nominationReason: string
  nominatedByClientUserId: string
}

export interface NearbyMarketCandidateDecisionUpdate {
  marketLocationId: string
  googlePlaceId: string
  state: SiteIntelligenceCandidateState
  approvedDomainId: string | null
  radiusKmAtDecision: NearbyMarketRadius
  agencyReviewReason: string | null
  reviewedAt: string | null
  reviewedByUserId: string | null
}

interface NearbyMarketNominationRow extends SiteIntelligenceCandidateRow {
  client_name: string
  market_location_label: string
  nominated_by_name: string | null
}

export interface NearbyMarketNomination {
  id: string
  clientId: string
  clientName: string
  marketLocationId: string
  marketLocationLabel: string
  googlePlaceId: string
  state: SiteIntelligenceCandidateState
  source: SiteIntelligenceCandidateSource
  nominationReason: string | null
  nominatedAt: string | null
  nominatedByClientUserId: string | null
  nominatedByName: string | null
  approvedDomainId: string | null
  updatedAt: string
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapMarketLocation(row: ClientMarketLocationRow): ClientMarketLocation {
  return {
    id: row.id,
    clientId: row.client_id,
    label: row.label,
    addressText: row.address_text,
    googlePlaceId: row.google_place_id,
    isPrimary: row.is_primary,
    confirmedAt: iso(row.confirmed_at)!,
    confirmedBy: row.confirmed_by,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!
  }
}

function mapCandidate(row: SiteIntelligenceCandidateRow): PersistedNearbyMarketCandidate {
  return {
    id: row.id,
    clientId: row.client_id,
    marketLocationId: row.market_location_id,
    googlePlaceId: row.google_place_id,
    state: row.state,
    source: row.source,
    approvedDomainId: row.approved_domain_id,
    radiusKmAtDecision: Number(row.radius_km_at_decision) as NearbyMarketRadius,
    nominationReason: row.nomination_reason,
    nominatedAt: iso(row.nominated_at),
    nominatedByClientUserId: row.nominated_by_client_user_id,
    agencyReviewReason: row.agency_review_reason,
    reviewedAt: iso(row.reviewed_at),
    reviewedByUserId: row.reviewed_by_user_id,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!
  }
}

export async function getPrimaryClientMarketLocation(
  clientId: string,
  executor?: NearbyMarketExecutor
): Promise<ClientMarketLocation | null> {
  const sql = `
    SELECT * FROM client_market_locations
    WHERE client_id = $1 AND is_primary = TRUE
  `
  if (executor) {
    const result = await executor.query<ClientMarketLocationRow>(`${sql} FOR UPDATE`, [clientId])
    return result.rows[0] ? mapMarketLocation(result.rows[0]) : null
  }
  const row = await queryOne<ClientMarketLocationRow>(sql, [clientId])
  return row ? mapMarketLocation(row) : null
}

export async function getClientMarketLocation(
  clientId: string,
  marketLocationId: string
): Promise<ClientMarketLocation | null> {
  const row = await queryOne<ClientMarketLocationRow>(`
    SELECT * FROM client_market_locations
    WHERE client_id = $1 AND id = $2
  `, [clientId, marketLocationId])
  return row ? mapMarketLocation(row) : null
}

export async function upsertPrimaryClientMarketLocation(
  clientId: string,
  input: UpsertPrimaryMarketLocationInput,
  executor?: NearbyMarketExecutor
): Promise<ClientMarketLocation> {
  const sql = `
    INSERT INTO client_market_locations (
      client_id, label, address_text, google_place_id, is_primary, confirmed_by
    ) VALUES ($1, $2, $3, $4, TRUE, $5)
    ON CONFLICT (client_id) WHERE is_primary = TRUE
    DO UPDATE SET
      label = EXCLUDED.label,
      address_text = EXCLUDED.address_text,
      google_place_id = EXCLUDED.google_place_id,
      confirmed_at = NOW(),
      confirmed_by = EXCLUDED.confirmed_by,
      updated_at = NOW()
    WHERE client_market_locations.client_id = $1
    RETURNING *
  `
  const params = [clientId, input.label, input.addressText, input.googlePlaceId, input.confirmedBy]

  if (executor) {
    const result = await executor.query<ClientMarketLocationRow>(sql, params)
    const row = result.rows[0]
    if (!row) throw new Error('Nearby market location upsert returned no row')
    return mapMarketLocation(row)
  }

  const row = await queryOne<ClientMarketLocationRow>(sql, params)
  if (!row) throw new Error('Nearby market location upsert returned no row')
  return mapMarketLocation(row)
}

export async function getNearbyMarketCandidate(
  clientId: string,
  marketLocationId: string,
  googlePlaceId: string,
  executor?: NearbyMarketExecutor
): Promise<PersistedNearbyMarketCandidate | null> {
  const sql = `
    SELECT * FROM site_intelligence_candidates
    WHERE client_id = $1 AND market_location_id = $2 AND google_place_id = $3
  `
  const params = [clientId, marketLocationId, googlePlaceId]
  if (executor) {
    const result = await executor.query<SiteIntelligenceCandidateRow>(sql, params)
    return result.rows[0] ? mapCandidate(result.rows[0]) : null
  }
  const row = await queryOne<SiteIntelligenceCandidateRow>(sql, params)
  return row ? mapCandidate(row) : null
}

export async function materializeAndLockNearbyMarketCandidate(
  clientId: string,
  input: {
    marketLocationId: string
    googlePlaceId: string
    radiusKmAtDecision: NearbyMarketRadius
  },
  executor: NearbyMarketExecutor
): Promise<PersistedNearbyMarketCandidate> {
  await executor.query(`
    INSERT INTO site_intelligence_candidates (
      client_id, market_location_id, google_place_id, state, source,
      approved_domain_id, radius_km_at_decision
    ) VALUES ($1, $2, $3, 'saved', 'agency', NULL, $4)
    ON CONFLICT (client_id, market_location_id, google_place_id) DO NOTHING
  `, [clientId, input.marketLocationId, input.googlePlaceId, input.radiusKmAtDecision])

  const result = await executor.query<SiteIntelligenceCandidateRow>(`
    SELECT * FROM site_intelligence_candidates
    WHERE client_id = $1 AND market_location_id = $2 AND google_place_id = $3
    FOR UPDATE
  `, [clientId, input.marketLocationId, input.googlePlaceId])
  const row = result.rows[0]
  if (!row) throw new Error('Nearby market candidate lock returned no row')
  return mapCandidate(row)
}

export async function updateNearbyMarketCandidateDecision(
  clientId: string,
  input: NearbyMarketCandidateDecisionUpdate,
  executor: NearbyMarketExecutor
): Promise<PersistedNearbyMarketCandidate> {
  const result = await executor.query<SiteIntelligenceCandidateRow>(`
    UPDATE site_intelligence_candidates
    SET state = $4,
        approved_domain_id = $5,
        radius_km_at_decision = $6,
        agency_review_reason = $7,
        reviewed_at = $8,
        reviewed_by_user_id = $9,
        updated_at = NOW()
    WHERE client_id = $1 AND market_location_id = $2 AND google_place_id = $3
    RETURNING *
  `, [
    clientId,
    input.marketLocationId,
    input.googlePlaceId,
    input.state,
    input.approvedDomainId,
    input.radiusKmAtDecision,
    input.agencyReviewReason,
    input.reviewedAt,
    input.reviewedByUserId
  ])
  const row = result.rows[0]
  if (!row) throw new Error('Nearby market candidate decision returned no row')
  return mapCandidate(row)
}

export async function listNearbyMarketCandidates(
  clientId: string,
  marketLocationId: string,
  googlePlaceIds?: string[]
): Promise<PersistedNearbyMarketCandidate[]> {
  const rows = await queryRows<SiteIntelligenceCandidateRow>(`
    SELECT * FROM site_intelligence_candidates
    WHERE client_id = $1
      AND market_location_id = $2
      AND ($3::text[] IS NULL OR google_place_id = ANY($3::text[]))
    ORDER BY updated_at DESC
  `, [clientId, marketLocationId, googlePlaceIds ?? null])
  return rows.map(mapCandidate)
}

export async function listNearbyMarketNominations(
  clientId?: string
): Promise<NearbyMarketNomination[]> {
  const rows = await queryRows<NearbyMarketNominationRow>(`
    SELECT candidate.*, client.name AS client_name,
           location.label AS market_location_label,
           nominator.name AS nominated_by_name
    FROM site_intelligence_candidates candidate
    JOIN agency_clients client ON client.id = candidate.client_id
    JOIN client_market_locations location
      ON location.client_id = candidate.client_id
     AND location.id = candidate.market_location_id
    LEFT JOIN client_users nominator ON nominator.id = candidate.nominated_by_client_user_id
    WHERE candidate.state = 'nominated'
      AND ($1::uuid IS NULL OR candidate.client_id = $1)
    ORDER BY candidate.nominated_at ASC NULLS LAST, candidate.updated_at ASC
  `, [clientId ?? null])

  return rows.map(row => ({
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    marketLocationId: row.market_location_id,
    marketLocationLabel: row.market_location_label,
    googlePlaceId: row.google_place_id,
    state: row.state,
    source: row.source,
    nominationReason: row.nomination_reason,
    nominatedAt: iso(row.nominated_at),
    nominatedByClientUserId: row.nominated_by_client_user_id,
    nominatedByName: row.nominated_by_name,
    approvedDomainId: row.approved_domain_id,
    updatedAt: iso(row.updated_at)!
  }))
}

export async function nominateNearbyMarketCandidate(
  clientId: string,
  input: NominateNearbyMarketCandidateInput,
  executor: NearbyMarketExecutor
): Promise<PersistedNearbyMarketCandidate> {
  const result = await executor.query<SiteIntelligenceCandidateRow>(`
    INSERT INTO site_intelligence_candidates (
      client_id, market_location_id, google_place_id, state, source,
      approved_domain_id, radius_km_at_decision, nomination_reason, nominated_at,
      nominated_by_client_user_id, agency_review_reason, reviewed_at, reviewed_by_user_id
    ) VALUES ($1, $2, $3, 'nominated', 'client_portal', NULL, $4, $5, NOW(), $6, NULL, NULL, NULL)
    ON CONFLICT (client_id, market_location_id, google_place_id)
    DO UPDATE SET
      state = 'nominated',
      source = 'client_portal',
      approved_domain_id = NULL,
      radius_km_at_decision = EXCLUDED.radius_km_at_decision,
      nomination_reason = EXCLUDED.nomination_reason,
      nominated_at = NOW(),
      nominated_by_client_user_id = EXCLUDED.nominated_by_client_user_id,
      agency_review_reason = NULL,
      reviewed_at = NULL,
      reviewed_by_user_id = NULL,
      updated_at = NOW()
    WHERE site_intelligence_candidates.client_id = $1
    RETURNING *
  `, [
    clientId,
    input.marketLocationId,
    input.googlePlaceId,
    input.radiusKmAtDecision,
    input.nominationReason,
    input.nominatedByClientUserId
  ])
  const row = result.rows[0]
  if (!row) throw new Error('Nearby market candidate nomination returned no row')
  return mapCandidate(row)
}

export async function upsertNearbyMarketCandidate(
  clientId: string,
  input: UpsertNearbyMarketCandidateInput,
  executor?: NearbyMarketExecutor
): Promise<PersistedNearbyMarketCandidate> {
  const sql = `
    INSERT INTO site_intelligence_candidates (
      client_id, market_location_id, google_place_id, state, source,
      approved_domain_id, radius_km_at_decision, nomination_reason, nominated_at,
      nominated_by_client_user_id, agency_review_reason, reviewed_at, reviewed_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (client_id, market_location_id, google_place_id)
    DO UPDATE SET
      state = EXCLUDED.state,
      source = EXCLUDED.source,
      approved_domain_id = EXCLUDED.approved_domain_id,
      radius_km_at_decision = EXCLUDED.radius_km_at_decision,
      nomination_reason = EXCLUDED.nomination_reason,
      nominated_at = EXCLUDED.nominated_at,
      nominated_by_client_user_id = EXCLUDED.nominated_by_client_user_id,
      agency_review_reason = EXCLUDED.agency_review_reason,
      reviewed_at = EXCLUDED.reviewed_at,
      reviewed_by_user_id = EXCLUDED.reviewed_by_user_id,
      updated_at = NOW()
    WHERE site_intelligence_candidates.client_id = $1
    RETURNING *
  `
  const params = [
    clientId,
    input.marketLocationId,
    input.googlePlaceId,
    input.state,
    input.source,
    input.approvedDomainId,
    input.radiusKmAtDecision,
    input.nominationReason,
    input.nominatedAt,
    input.nominatedByClientUserId,
    input.agencyReviewReason,
    input.reviewedAt,
    input.reviewedByUserId
  ]

  if (executor) {
    const result = await executor.query<SiteIntelligenceCandidateRow>(sql, params)
    const row = result.rows[0]
    if (!row) throw new Error('Nearby market candidate upsert returned no row')
    return mapCandidate(row)
  }

  const row = await queryOne<SiteIntelligenceCandidateRow>(sql, params)
  if (!row) throw new Error('Nearby market candidate upsert returned no row')
  return mapCandidate(row)
}
