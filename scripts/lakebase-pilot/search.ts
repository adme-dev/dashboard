import type { CrmSearchHit } from '../../server/utils/crm/search'
import type { PilotDatabaseQuery } from './database'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export type PilotSearchHit = CrmSearchHit

export interface PilotLegacySearchDatabase {
  query: PilotDatabaseQuery
}

export interface PilotBm25SearchDatabase {
  transaction: <T>(callback: (query: PilotDatabaseQuery) => Promise<T>) => Promise<T>
}

export interface PilotSearchQuery {
  sql: string
  params: unknown[]
}

interface PilotSearchRow {
  type: PilotSearchHit['type']
  id: string
  title: string
  subtitle: string | null
  raw_score: number | string
}

function normalizeLimit(limit: number): number {
  const integer = Math.floor(limit)
  return Number.isFinite(integer) ? Math.max(1, Math.min(MAX_LIMIT, integer)) : DEFAULT_LIMIT
}

function buildPilotSearchQuery(
  clientId: string,
  term: string,
  limit: number,
  sql: string
): PilotSearchQuery | null {
  const query = term.trim()
  if (!query) return null

  return {
    sql,
    params: [query, clientId, normalizeLimit(limit)]
  }
}

export function buildLegacyPilotSearchQuery(
  clientId: string,
  term: string,
  limit = DEFAULT_LIMIT
): PilotSearchQuery | null {
  return buildPilotSearchQuery(clientId, term, limit, `
SELECT entity_type AS type, entity_id::text AS id, title, subtitle,
       ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS raw_score
FROM lakebase_pilot.crm_search_documents
WHERE client_id = $2
  AND search_vector @@ websearch_to_tsquery('english', $1)
ORDER BY raw_score DESC, title ASC, entity_id ASC
LIMIT $3`)
}

export function buildBm25PilotSearchQuery(
  clientId: string,
  term: string,
  limit = DEFAULT_LIMIT
): PilotSearchQuery | null {
  return buildPilotSearchQuery(clientId, term, limit, `
SELECT entity_type AS type, entity_id::text AS id, title, subtitle,
       search_vector <@> to_bm25query(
         to_tsvector('english', $1),
         'lakebase_pilot.crm_search_documents_bm25_idx'
       ) AS raw_score
FROM lakebase_pilot.crm_search_documents
WHERE client_id = $2
  AND search_vector @@ websearch_to_tsquery('english', $1)
ORDER BY raw_score ASC, title ASC, entity_id ASC
LIMIT $3`)
}

function toSearchHits(rows: Record<string, unknown>[], rank: (rawScore: number) => number): PilotSearchHit[] {
  return rows.map((row) => {
    const searchRow = row as unknown as PilotSearchRow
    return {
      type: searchRow.type,
      id: searchRow.id,
      title: searchRow.title,
      subtitle: searchRow.subtitle,
      rank: rank(Number(searchRow.raw_score))
    }
  })
}

export function normalizeBm25Rank(rawScore: number): number {
  return Math.max(0, -rawScore)
}

export async function searchLegacyPilot(
  database: PilotLegacySearchDatabase,
  clientId: string,
  term: string,
  limit = DEFAULT_LIMIT
): Promise<PilotSearchHit[]> {
  const built = buildLegacyPilotSearchQuery(clientId, term, limit)
  if (!built) return []

  const rows = await database.query(built.sql, built.params)
  return toSearchHits(rows, rawScore => rawScore)
}

export async function searchBm25Pilot(
  database: PilotBm25SearchDatabase,
  clientId: string,
  term: string,
  limit = DEFAULT_LIMIT
): Promise<PilotSearchHit[]> {
  const built = buildBm25PilotSearchQuery(clientId, term, limit)
  if (!built) return []

  return database.transaction(async (query) => {
    await query('SET LOCAL lakebase_bm25.prefilter = on')
    const rows = await query(built.sql, built.params)
    return toSearchHits(rows, normalizeBm25Rank)
  })
}
