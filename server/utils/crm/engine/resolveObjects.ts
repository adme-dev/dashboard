// server/utils/crm/engine/resolveObjects.ts
// Two-axis isolation source of truth. Pure helper `filterVisibleObjects` is unit-tested;
// the DB-backed `resolveClientObjects` / `assertObjectVisible` compose it with queries.
import { queryRows, queryOne } from '~~/server/utils/db'
import type { ObjectDef } from './types'

export interface ObjectVisibilityRow {
  id: string
  key: string
  vertical_key: string
}

// Keep only objects whose vertical_key is in the enabled set.
export function filterVisibleObjects<T extends { vertical_key: string }>(
  objects: T[],
  enabledVerticals: string[],
): T[] {
  const enabled = new Set(enabledVerticals)
  return objects.filter(o => enabled.has(o.vertical_key))
}

async function enabledVerticalsFor(clientId: string): Promise<string[]> {
  const rows = await queryRows<{ vertical_key: string }>(
    `SELECT vertical_key FROM crm_client_verticals WHERE client_id = $1`,
    [clientId],
  )
  return ['generic', ...rows.map(r => r.vertical_key)]
}

// All object defs a client may see (client_id AND enabled vertical).
export async function resolveClientObjects(clientId: string): Promise<ObjectDef[]> {
  const [objects, enabled] = await Promise.all([
    queryRows<ObjectDef>(
      `SELECT * FROM crm_object_defs WHERE client_id = $1 AND deleted_at IS NULL ORDER BY position, label`,
      [clientId],
    ),
    enabledVerticalsFor(clientId),
  ])
  return filterVisibleObjects(objects, enabled)
}

// Resolve one object by key for a client, enforcing the two-axis gate. Throws 404 if not
// visible (unknown, soft-deleted, wrong client, or vertical not enabled).
export async function assertObjectVisible(clientId: string, objectKey: string): Promise<ObjectDef> {
  const obj = await queryOne<ObjectDef>(
    `SELECT * FROM crm_object_defs WHERE client_id = $1 AND key = $2 AND deleted_at IS NULL`,
    [clientId, objectKey],
  )
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Object not found' })
  const enabled = await enabledVerticalsFor(clientId)
  if (!enabled.includes(obj.vertical_key)) {
    throw createError({ statusCode: 404, statusMessage: 'Object not found' })
  }
  return obj
}
