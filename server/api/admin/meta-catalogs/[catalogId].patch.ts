import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { loadMetaCatalogConnection, requireOwnedMetaCatalog } from '~~/server/utils/metaCatalogAccess'
import { updateMetaProductCatalog } from '~~/server/utils/metaCatalogClient'
import { throwMetaCatalogHttpError } from '~~/server/utils/metaCatalogHttp'

const bodySchema = z.object({
  connectionId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const catalogId = String(getRouterParam(event, 'catalogId') || '').trim()
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!catalogId || catalogId.length > 64 || !parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid catalog and name.' })
  }

  const connection = await loadMetaCatalogConnection(parsed.data.connectionId)

  try {
    await requireOwnedMetaCatalog(connection, catalogId)
    const catalog = await updateMetaProductCatalog(catalogId, connection.accessToken, { name: parsed.data.name })
    return { catalog }
  } catch (error) {
    throwMetaCatalogHttpError(error, 'rename')
  }
})
