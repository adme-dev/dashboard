// server/utils/crm/search.ts
// F8 — client-scoped, ranked full-text search across CRM entities.
// Pure query-builder: returns parameterised SQL ($1=term, $2=client, $3=limit)
// for the API handler to run. Each entity's tsvector expression MUST mirror the
// matching GIN index in migration 152 so the index is actually used.

export type CrmSearchTargetType = 'person' | 'company' | 'opportunity' | 'activity' | 'task'

export interface CrmSearchHit {
  type: CrmSearchTargetType
  id: string
  title: string
  subtitle: string | null
  rank: number
}

interface EntitySpec {
  type: CrmSearchTargetType
  table: string
  /** tsvector expression — keep byte-identical to the GIN index in mig 152. */
  vector: string
  /** SQL expression projecting a human title. */
  title: string
  /** SQL expression projecting a secondary line (nullable). */
  subtitle: string
}

export const SEARCH_ENTITIES: EntitySpec[] = [
  {
    type: 'person',
    table: 'crm_people',
    vector:
      "to_tsvector('english', COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(job_title,'') || ' ' || COALESCE(notes,''))",
    title: "TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))",
    subtitle: 'email',
  },
  {
    type: 'company',
    table: 'crm_companies',
    vector: "to_tsvector('english', COALESCE(name,'') || ' ' || COALESCE(domain,'') || ' ' || COALESCE(notes,''))",
    title: 'name',
    subtitle: 'domain',
  },
  {
    type: 'opportunity',
    table: 'crm_opportunities',
    vector: "to_tsvector('english', COALESCE(name,'') || ' ' || COALESCE(notes,''))",
    title: 'name',
    subtitle: 'status',
  },
  {
    type: 'activity',
    table: 'crm_activities',
    vector: "to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(body,''))",
    title: 'title',
    subtitle: 'type',
  },
  {
    type: 'task',
    table: 'crm_tasks',
    vector: "to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(description,''))",
    title: 'title',
    subtitle: 'status',
  },
]

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * Build the search query, or null when the term is blank.
 * Params are positional and shared across branches: $1 term, $2 client, $3 limit.
 */
export function buildSearchQuery(
  clientId: string,
  term: string,
  limit = DEFAULT_LIMIT,
): { sql: string, params: unknown[] } | null {
  const trimmed = term.trim()
  if (!trimmed) return null
  const n = Math.floor(limit)
  const lim = Number.isFinite(n) ? Math.max(1, Math.min(MAX_LIMIT, n)) : DEFAULT_LIMIT

  const branches = SEARCH_ENTITIES.map(e =>
    `SELECT '${e.type}' AS type, id::text AS id, ${e.title} AS title, ${e.subtitle} AS subtitle, ` +
    `ts_rank(${e.vector}, websearch_to_tsquery('english', $1)) AS rank ` +
    `FROM ${e.table} ` +
    `WHERE client_id = $2 AND deleted_at IS NULL ` +
    `AND ${e.vector} @@ websearch_to_tsquery('english', $1)`,
  )

  const sql = `SELECT * FROM (\n  ${branches.join('\n  UNION ALL\n  ')}\n) s ORDER BY rank DESC, title ASC LIMIT $3`
  return { sql, params: [trimmed, clientId, lim] }
}
