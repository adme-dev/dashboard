import { z } from 'zod'
import { execute, queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { resolveSearchConsoleCredential } from '~~/server/utils/searchAuthority/credentials'
import { listSearchConsoleProperties } from '~~/server/utils/searchAuthority/googleClient'

const Body = z.object({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  propertyUri: z.string().trim().min(1).max(2048),
  permissionLevel: z.enum([
    'siteOwner',
    'siteFullUser',
    'siteRestrictedUser',
    'siteUnverifiedUser'
  ])
})

export default eventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Search Console property mapping'
    })
  }
  const input = parsed.data
  await requireAgencySearchAuthorityAccess(event, input.clientId)

  const ownership = await queryOne<{
    connection_id: string
    site_id: string
  }>(
    `SELECT connection.id AS connection_id, site.id AS site_id
     FROM search_console_connections connection
     JOIN search_authority_sites site
       ON site.client_id = connection.client_id
      AND site.status = 'active'
     WHERE connection.id = $1
       AND connection.client_id = $2
       AND connection.status IN ('active', 'degraded')
     LIMIT 1`,
    [input.connectionId, input.clientId]
  )
  if (!ownership) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Search Console connection not found'
    })
  }

  const credential = await resolveSearchConsoleCredential(input.connectionId)
  if (credential.clientId !== input.clientId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Search Console connection not found'
    })
  }
  const properties = await listSearchConsoleProperties(credential.accessToken)
  const property = properties.find(item => item.propertyUri === input.propertyUri)
  if (!property || property.permissionLevel !== input.permissionLevel) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Search Console property permissions changed'
    })
  }
  if (property.permissionLevel === 'siteUnverifiedUser') {
    throw createError({
      statusCode: 400,
      statusMessage: 'The Search Console property is not verified'
    })
  }

  const status = property.permissionLevel === 'siteRestrictedUser'
    ? 'restricted'
    : 'active'
  await execute(
    `INSERT INTO search_console_property_maps (
       client_id, site_id, connection_id, property_uri,
       permission_level, property_type, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (client_id, property_uri)
     DO UPDATE SET
       site_id = EXCLUDED.site_id,
       connection_id = EXCLUDED.connection_id,
       permission_level = EXCLUDED.permission_level,
       property_type = EXCLUDED.property_type,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [
      input.clientId,
      ownership.site_id,
      input.connectionId,
      property.propertyUri,
      property.permissionLevel,
      property.propertyType,
      status
    ]
  )

  return { ok: true }
})
