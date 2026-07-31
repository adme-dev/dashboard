import { getQuery } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

const Query = z.object({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid()
})

export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Search Console connection'
    })
  }
  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)

  await transaction(async (db) => {
    const connection = await db.query<{
      google_credential_profile_id: string
    }>(
      `UPDATE search_console_connections
       SET status = 'disconnected',
           last_checked_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND client_id = $2
         AND status <> 'disconnected'
       RETURNING google_credential_profile_id`,
      [parsed.data.connectionId, parsed.data.clientId]
    )
    const profileId = connection.rows[0]?.google_credential_profile_id
    if (!profileId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Search Console connection not found'
      })
    }

    await db.query(
      `UPDATE search_console_property_maps
       SET status = 'disconnected', updated_at = NOW()
       WHERE connection_id = $1
         AND client_id = $2`,
      [parsed.data.connectionId, parsed.data.clientId]
    )
    await db.query(
      `UPDATE google_credential_profiles
       SET status = 'disconnected', updated_at = NOW()
       WHERE id = $1
         AND metadata->>'purpose' = 'search_console'`,
      [profileId]
    )
  })

  return { ok: true }
})
