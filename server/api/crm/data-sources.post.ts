import { PERMISSIONS } from '~~/server/utils/permissions'
import { createCatalogSourceForClientWithDb } from '~~/server/utils/crm/catalogSourceService'
import { executeGodModeCatalogSourceUpsert } from '~~/server/utils/crm/catalogSourceGodMode'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CLIENTS)
  const body = await readBody<Record<string, unknown>>(event)
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'client_id is required' })
  const source = await executeGodModeCatalogSourceUpsert(
    event,
    async db => await createCatalogSourceForClientWithDb(db, clientId, user.id, body),
    async (db, sourceId) => {
      const result = await db.query(
        `SELECT *
           FROM crm_catalog_sources
          WHERE client_id = $1 AND id = $2`,
        [clientId, sourceId]
      )
      if (!result.rows[0]) throw new Error('Replayed catalog source no longer exists')
      return result.rows[0]
    }
  )
  setResponseStatus(event, 201)
  return { source }
})
