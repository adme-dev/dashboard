import { z } from 'zod'
import { requirePermission } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { getEffectiveMetaPermissionEvidence } from '~~/server/utils/metaPermissionEvidence'

const bodySchema = z.object({
  connectionId: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'MEDIA_BUYING')

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'A valid Meta connection is required.' })
  }

  const connection = await queryOne<{
    access_token: string
    token_expires_at: string | null
  }>(
    `SELECT access_token, token_expires_at
     FROM social_connections
     WHERE id = $1 AND platform = 'meta' AND status = 'active'`,
    [parsed.data.connectionId],
  )

  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'Active Meta connection not found.' })
  }
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() <= Date.now()) {
    throw createError({ statusCode: 401, statusMessage: 'The Meta access token has expired. Reconnect Meta to continue.' })
  }

  const { scopes } = await getEffectiveMetaPermissionEvidence(connection.access_token, 'catalog')
  await execute(
    `UPDATE social_connections
     SET scopes = $1, updated_at = NOW()
     WHERE platform = 'meta' AND access_token = $2`,
    [scopes, connection.access_token],
  )

  return { scopes }
})
