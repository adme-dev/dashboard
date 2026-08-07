import { z } from 'zod'
import { createError, defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'
import { parseGooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfigRuntime'
import {
  createGooglePmaxLaunch,
  GooglePmaxLaunchConflictError
} from '~~/server/utils/googlePmaxLaunchStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const BodySchema = z.strictObject({
  normalizedConfig: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/).optional()
})

interface BriefIdentityRow {
  id: string
  client_id: string
  status: string
  launch_config_version: number
  template_slug: string
  connection_id: string
}

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'MEDIA_BUYING')
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  const parsedBody = BodySchema.safeParse(await readBody(event))
  if (!parsedBody.success) throw createError({ statusCode: 400, statusMessage: 'Invalid launch plan' })

  let config
  try {
    config = parseGooglePmaxInventoryLaunchConfig(parsedBody.data.normalizedConfig)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid launch plan configuration' })
  }
  if (config.tenantId !== tenantId) {
    throw createError({ statusCode: 403, statusMessage: 'Launch plan belongs to another organization' })
  }
  await requireSocialClientAccess(event, config.clientId)
  const brief = await queryOne<BriefIdentityRow>(
    `SELECT b.id, b.client_id, b.status, b.launch_config_version, bt.slug AS template_slug,
            sc.id AS connection_id
       FROM briefs b
       JOIN brief_templates bt ON bt.id = b.template_id
       JOIN social_connections sc
         ON sc.id = $3::uuid
        AND sc.client_id = b.client_id
        AND sc.platform = 'google'
        AND sc.status = 'active'
        AND REPLACE(sc.account_id, '-', '') = $4
      WHERE b.id = $1::uuid
        AND b.client_id = $2::uuid
        AND $5::text = (
          SELECT tenant_id
            FROM xero_org_connection
           WHERE tenant_id <> '__default__'
           ORDER BY updated_at DESC
           LIMIT 1
        )
      LIMIT 1`,
    [config.briefId, config.clientId, config.connectionId, config.customerId, tenantId]
  )
  if (
    !brief
    || brief.status !== 'approved'
    || brief.template_slug !== 'google-pmax'
    || brief.launch_config_version !== config.briefVersion
    || brief.connection_id.toLowerCase() !== config.connectionId.toLowerCase()
  ) {
    throw createError({ statusCode: 409, statusMessage: 'Approved brief version no longer matches this launch plan' })
  }

  const configHash = hashCanonicalLaunchJson(config)
  const idempotencyKey = hashCanonicalLaunchJson({
    tenantId,
    briefId: config.briefId,
    configVersion: config.briefVersion,
    configHash
  })
  if (parsedBody.data.idempotencyKey && parsedBody.data.idempotencyKey !== idempotencyKey) {
    throw createError({ statusCode: 409, statusMessage: 'Idempotency key does not match this launch plan' })
  }
  try {
    return await createGooglePmaxLaunch({
      tenantId,
      briefId: config.briefId,
      clientId: config.clientId,
      connectionId: config.connectionId,
      configVersion: config.briefVersion,
      configHash,
      idempotencyKey,
      normalizedConfig: config as unknown as Record<string, unknown>,
      actorId: user.id
    })
  } catch (error: unknown) {
    if (error instanceof GooglePmaxLaunchConflictError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
})
