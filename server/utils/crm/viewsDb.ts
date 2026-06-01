// server/utils/crm/viewsDb.ts
// F9 — saved-view persistence shared by the agency + portal endpoints.
// Visibility: a caller sees their own views plus any shared view for the same
// client+entity. Mutations are restricted to the view's creator.
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import type { CrmEntity, CrmView } from '~/types/crm'

export const VIEW_ENTITIES: CrmEntity[] = ['people', 'companies', 'opportunities']

export async function listViews(clientId: string, entity: CrmEntity, userId: string): Promise<CrmView[]> {
  return await queryRows<CrmView>(
    `SELECT * FROM crm_views
      WHERE client_id = $1 AND entity = $2 AND (is_shared = true OR created_by = $3)
      ORDER BY name ASC`,
    [clientId, entity, userId],
  )
}

export async function createView(input: {
  clientId: string, entity: CrmEntity, name: string,
  filters: unknown, columns: unknown, isShared: boolean, userId: string,
}): Promise<CrmView> {
  const row = await queryOne<CrmView>(
    `INSERT INTO crm_views (client_id, entity, name, filters, columns, is_shared, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
     RETURNING *`,
    [
      input.clientId, input.entity, input.name,
      JSON.stringify(input.filters ?? {}), JSON.stringify(input.columns ?? []),
      input.isShared, input.userId,
    ],
  )
  if (!row) throw createError({ statusCode: 500, statusMessage: 'Failed to create view' })
  return row
}

export async function updateView(
  id: string, clientId: string, userId: string,
  patch: { name?: string, filters?: unknown, columns?: unknown, isShared?: boolean },
): Promise<CrmView> {
  // Only the creator may edit; client scope enforced too.
  const sets: string[] = []
  const params: unknown[] = []
  const add = (frag: string, val: unknown) => { params.push(val); sets.push(frag.replace('?', `$${params.length}`)) }
  if (patch.name !== undefined) add('name = ?', patch.name)
  if (patch.filters !== undefined) add('filters = ?::jsonb', JSON.stringify(patch.filters))
  if (patch.columns !== undefined) add('columns = ?::jsonb', JSON.stringify(patch.columns))
  if (patch.isShared !== undefined) add('is_shared = ?', patch.isShared)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'Nothing to update' })
  sets.push('updated_at = now()')
  params.push(id, clientId, userId)
  const row = await queryOne<CrmView>(
    `UPDATE crm_views SET ${sets.join(', ')}
      WHERE id = $${params.length - 2} AND client_id = $${params.length - 1} AND created_by = $${params.length}
      RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'View not found or not yours' })
  return row
}

export async function deleteView(id: string, clientId: string, userId: string): Promise<void> {
  const n = await execute(
    `DELETE FROM crm_views WHERE id = $1 AND client_id = $2 AND created_by = $3`,
    [id, clientId, userId],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'View not found or not yours' })
}
