import { queryRows } from '~~/server/utils/db'
import { crmVisibilityCond } from '~~/server/utils/crm/recordAccess'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

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
  alias: string
  /** Keep byte-identical to the matching GIN expression in migration 152. */
  vector: string
  title: string
  subtitle: string
}

export const SEARCH_ENTITIES: EntitySpec[] = [
  {
    type: 'person',
    table: 'crm_people',
    alias: 'person',
    vector: `to_tsvector('english', COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(job_title,'') || ' ' || COALESCE(notes,''))`,
    title: `TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))`,
    subtitle: 'email'
  },
  {
    type: 'company',
    table: 'crm_companies',
    alias: 'company',
    vector: `to_tsvector('english', COALESCE(name,'') || ' ' || COALESCE(domain,'') || ' ' || COALESCE(notes,''))`,
    title: 'name',
    subtitle: 'domain'
  },
  {
    type: 'opportunity',
    table: 'crm_opportunities',
    alias: 'opportunity',
    vector: `to_tsvector('english', COALESCE(name,'') || ' ' || COALESCE(notes,''))`,
    title: 'name',
    subtitle: 'status'
  },
  {
    type: 'activity',
    table: 'crm_activities',
    alias: 'activity',
    vector: `to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(body,''))`,
    title: 'title',
    subtitle: 'type'
  },
  {
    type: 'task',
    table: 'crm_tasks',
    alias: 'task',
    vector: `to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(description,''))`,
    title: 'title',
    subtitle: 'status'
  }
]

export const CRM_KEYWORD_POOL_LIMIT = 50

type KeywordRow = {
  type: string
  id: string
  title: string | null
  subtitle: string | null
  rank: string | number
}

export interface CrmKeywordSearchDependencies {
  queryRows: <T>(sql: string, params?: unknown[]) => Promise<T[]>
}

const defaultDependencies: CrmKeywordSearchDependencies = { queryRows }

function boundedPoolLimit(value: number) {
  const integer = Math.floor(value)
  return Number.isFinite(integer) ? Math.max(1, Math.min(CRM_KEYWORD_POOL_LIMIT, integer)) : CRM_KEYWORD_POOL_LIMIT
}

function numberVisibility(
  sql: string,
  values: readonly unknown[],
  params: unknown[]
): string {
  let consumed = 0
  const numbered = sql.replace(/\?/g, () => {
    const index = params.length + consumed + 1
    consumed += 1
    return `$${index}`
  })
  if (consumed !== values.length) throw new Error('CRM search visibility placeholder mismatch')
  params.push(...values)
  return numbered
}

/**
 * Builds deterministic keyword SQL from a fresh, server-owned context.
 * $1 is the normalized term, $2 the authorized client, and $3 the pool limit.
 */
export function buildSearchQuery(
  context: CrmSearchContext,
  normalizedTerm: string,
  poolLimit = CRM_KEYWORD_POOL_LIMIT
): { sql: string, params: unknown[] } | null {
  const term = normalizedTerm.trim()
  if (!term) return null
  const params: unknown[] = [term, context.clientId, boundedPoolLimit(poolLimit)]

  const branches = SEARCH_ENTITIES.map((entity) => {
    const visibility = crmVisibilityCond(context, entity.type, entity.alias)
    const visibilitySql = visibility
      ? ` AND ${numberVisibility(visibility.sql, visibility.params, params)}`
      : ''
    return `SELECT '${entity.type}' AS type, ${entity.alias}.id::text AS id, ${entity.title} AS title, ${entity.subtitle} AS subtitle, `
      + `ts_rank(${entity.vector}, websearch_to_tsquery('english', $1)) AS rank `
      + `FROM ${entity.table} ${entity.alias} `
      + `WHERE ${entity.alias}.client_id = $2 AND ${entity.alias}.deleted_at IS NULL${visibilitySql} `
      + `AND ${entity.vector} @@ websearch_to_tsquery('english', $1)`
  })

  return {
    sql: `SELECT * FROM (\n  ${branches.join('\n  UNION ALL\n  ')}\n) search_hits ORDER BY rank DESC, title ASC, type ASC, id ASC LIMIT $3`,
    params
  }
}

/** Executes only the authorized Postgres keyword branch and returns public hits. */
export async function runCrmKeywordSearch(
  context: CrmSearchContext,
  normalizedTerm: string,
  poolLimit = CRM_KEYWORD_POOL_LIMIT,
  dependencies: CrmKeywordSearchDependencies = defaultDependencies
): Promise<CrmSearchHit[]> {
  const built = buildSearchQuery(context, normalizedTerm, poolLimit)
  if (!built) return []
  const rows = await dependencies.queryRows<KeywordRow>(built.sql, built.params)
  return rows.map(row => ({
    type: row.type as CrmSearchTargetType,
    id: row.id,
    title: row.title || '(untitled)',
    subtitle: row.subtitle,
    rank: Number(row.rank)
  }))
}
