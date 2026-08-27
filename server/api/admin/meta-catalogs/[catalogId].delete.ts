import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { loadMetaCatalogConnection, requireOwnedMetaCatalog } from '~~/server/utils/metaCatalogAccess'
import { deleteMetaProductCatalog } from '~~/server/utils/metaCatalogClient'
import { throwMetaCatalogHttpError } from '~~/server/utils/metaCatalogHttp'

const bodySchema = z.object({
  connectionId: z.string().uuid(),
  confirmationName: z.string().min(1).max(120),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const catalogId = String(getRouterParam(event, 'catalogId') || '').trim()
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!catalogId || catalogId.length > 64 || !parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid catalog and confirmation name.' })
  }

  const connection = await loadMetaCatalogConnection(parsed.data.connectionId)

  try {
    const catalog = await requireOwnedMetaCatalog(connection, catalogId)
    if (parsed.data.confirmationName !== catalog.name) {
      throw createError({ statusCode: 400, statusMessage: 'The confirmation name must exactly match the catalog name.' })
    }
    await deleteMetaProductCatalog(catalogId, connection.accessToken)
    return { deleted: true, catalogId }
  } catch (error) {
    throwMetaCatalogHttpError(error, 'delete')
  }
})
