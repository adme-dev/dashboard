import { queryOne } from '~~/server/utils/db'
import { escapeLike } from '../toolContext'

export type ResolvedClient = { id: string, name: string }
export type ResolveClient = (name: string) => Promise<ResolvedClient | null>

/** Best single ILIKE match on agency_clients. Reads take the top match (no disambiguation). */
export const defaultResolveClient: ResolveClient = async (name) => {
  const row = await queryOne<ResolvedClient>(
    'SELECT id, name FROM agency_clients WHERE name ILIKE $1 ORDER BY name ASC LIMIT 1',
    [`%${escapeLike(name)}%`],
  )
  return row ?? null
}
