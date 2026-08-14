import { z } from 'zod'

import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { readGoogleMerchantReadiness } from '~~/server/utils/googleMerchantReadiness'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const QuerySchema = z.strictObject({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')
  const parsed = QuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Merchant readiness query' })
  }
  await requireSocialClientAccess(event, parsed.data.clientId)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  const connection = await queryOne<{ account_id: string }>(`
    SELECT account_id
      FROM social_connections
     WHERE id = $1::uuid
       AND client_id = $2::uuid
       AND platform = 'google'
       AND status = 'active'
     LIMIT 1
  `, [parsed.data.connectionId, parsed.data.clientId])
  if (!connection || !/^\d{10}$/.test(connection.account_id.replace(/-/g, ''))) {
    throw createError({ statusCode: 404, statusMessage: 'Scoped Google Ads connection not found' })
  }

  try {
    return await readGoogleMerchantReadiness({
      tenantId,
      clientId: parsed.data.clientId,
      connectionId: parsed.data.connectionId,
      customerId: connection.account_id.replace(/-/g, '')
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Google Merchant readiness could not be verified' })
  }
})
