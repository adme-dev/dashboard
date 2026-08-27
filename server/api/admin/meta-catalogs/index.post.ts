import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { listAccessibleMetaBusinesses, loadMetaCatalogConnection, requireMetaCatalogScope } from '~~/server/utils/metaCatalogAccess'
import { createMetaProductCatalog } from '~~/server/utils/metaCatalogClient'
import { throwMetaCatalogHttpError } from '~~/server/utils/metaCatalogHttp'

const bodySchema = z.object({
  connectionId: z.string().uuid(),
  businessId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2).max(120),
  vertical: z.enum(['vehicles', 'commerce']),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a catalog name, vertical, and accessible Meta Business.' })
  }

  const connection = await loadMetaCatalogConnection(parsed.data.connectionId)
  requireMetaCatalogScope(connection)

  try {
    const businesses = await listAccessibleMetaBusinesses(connection)
    if (!businesses.some(business => business.id === parsed.data.businessId)) {
      throw createError({ statusCode: 403, statusMessage: 'The selected Meta Business is not accessible with this connection.' })
    }
    const catalog = await createMetaProductCatalog(
      parsed.data.businessId,
      connection.accessToken,
      { name: parsed.data.name, vertical: parsed.data.vertical },
    )
    return { catalog }
  } catch (error) {
    throwMetaCatalogHttpError(error, 'create')
  }
})
