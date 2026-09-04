import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { listAccessibleMetaBusinesses, loadMetaCatalogConnection } from '~~/server/utils/metaCatalogAccess'
import { listMetaProductCatalogs } from '~~/server/utils/metaCatalogClient'
import { throwMetaCatalogHttpError } from '~~/server/utils/metaCatalogHttp'

const querySchema = z.object({
  connectionId: z.string().uuid(),
  businessId: z.string().trim().min(1).max(64).optional(),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'A valid Meta connection and Business are required.' })
  }

  const connection = await loadMetaCatalogConnection(parsed.data.connectionId)
  const connectionSummary = {
    id: connection.id,
    accountId: connection.accountId,
    accountName: connection.accountName,
    scopes: connection.scopes,
    tokenExpiresAt: connection.tokenExpiresAt,
  }
  const catalogAccessGranted = ['business_management', 'catalog_management']
    .every(scope => connection.scopes.includes(scope))

  if (!catalogAccessGranted) {
    return {
      connection: connectionSummary,
      businesses: [],
      selectedBusinessId: null,
      catalogs: [],
      catalogAccessGranted: false,
    }
  }

  try {
    const businesses = await listAccessibleMetaBusinesses(connection)
    const requestedBusinessId = parsed.data.businessId
    if (requestedBusinessId && !businesses.some(business => business.id === requestedBusinessId)) {
      throw createError({ statusCode: 403, statusMessage: 'The selected Meta Business is not accessible with this connection.' })
    }
    const selectedBusinessId = requestedBusinessId || businesses[0]?.id || null
    const catalogs = selectedBusinessId
      ? await listMetaProductCatalogs(selectedBusinessId, connection.accessToken)
      : []

    return {
      connection: connectionSummary,
      businesses,
      selectedBusinessId,
      catalogs,
      catalogAccessGranted: true,
    }
  } catch (error) {
    throwMetaCatalogHttpError(error, 'read')
  }
})
