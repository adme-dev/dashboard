import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requirePersonaAdminAccess } from '~~/server/utils/persona/access'

const bodySchema = z.strictObject({
  clientId: z.string().uuid(),
  provider: z.enum(['google_ads', 'meta']),
  entitlementStatus: z.enum(['active', 'suspended']),
  enabled: z.boolean(),
  emergencyStop: z.boolean(),
  acceptProviderTerms: z.boolean().default(false),
  reason: z.string().trim().min(3).max(1000),
})

type ConfigurationResult = {
  provider: 'google_ads' | 'meta'
  enabled: boolean
  emergency_stop: boolean
  terms_accepted_at: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requirePersonaAdminAccess(event)
  const parsed = bodySchema.safeParse(await readBody(event))

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || 'Invalid provider configuration',
    })
  }

  const body = parsed.data
  const actorId = String((user as any).userId || (user as any).id || '')

  if (!actorId) {
    throw createError({ statusCode: 500, statusMessage: 'Unable to resolve the agency actor' })
  }

  if (body.enabled && body.emergencyStop) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A provider cannot be enabled while its emergency stop is active',
    })
  }

  if (body.enabled && body.entitlementStatus !== 'active') {
    throw createError({
      statusCode: 400,
      statusMessage: 'An active audience entitlement is required before enabling a provider',
    })
  }

  const client = await queryOne<{ id: string }>(
    'SELECT id FROM agency_clients WHERE id = $1 LIMIT 1',
    [body.clientId],
  )

  if (!client) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  }

  const featureKey = body.provider === 'google_ads' ? 'audience.google' : 'audience.meta'
  const configurationAction = body.emergencyStop
    ? 'emergency_stopped'
    : body.enabled
      ? 'provider_configured'
      : 'provider_disabled'

  const result = await queryOne<ConfigurationResult>(
    `WITH entitlement AS (
       INSERT INTO client_feature_entitlements (client_id, feature_key, status, source)
       VALUES ($1, $2, $3, 'agency_activation')
       ON CONFLICT (client_id, feature_key)
       DO UPDATE SET
         status = EXCLUDED.status,
         source = EXCLUDED.source
       RETURNING feature_key, status
     ),
     provider_setting AS (
       INSERT INTO crm_persona_audience_provider_settings (
         client_id,
         provider,
         enabled,
         emergency_stop,
         terms_accepted_at,
         terms_accepted_by
       )
       VALUES (
         $1,
         $4,
         $5,
         $6,
         CASE WHEN $7 THEN NOW() ELSE NULL END,
         CASE WHEN $7 THEN $8::uuid ELSE NULL END
       )
       ON CONFLICT (client_id, provider)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         emergency_stop = EXCLUDED.emergency_stop,
         terms_accepted_at = CASE
           WHEN $7 THEN NOW()
           ELSE crm_persona_audience_provider_settings.terms_accepted_at
         END,
         terms_accepted_by = CASE
           WHEN $7 THEN $8::uuid
           ELSE crm_persona_audience_provider_settings.terms_accepted_by
         END,
         updated_at = NOW()
       RETURNING provider, enabled, emergency_stop, terms_accepted_at
     ),
     configuration_audit AS (
       INSERT INTO crm_persona_audience_configuration_audit (
         client_id,
         provider,
         actor_id,
         action,
         reason,
         metadata
       )
       SELECT
         $1,
         $4,
         $8::uuid,
         audit.action,
         $9,
         audit.metadata
       FROM (
         VALUES
           (
             CASE WHEN $3 = 'active' THEN 'entitlement_enabled' ELSE 'entitlement_suspended' END,
             jsonb_build_object('featureKey', $2, 'status', $3)
           ),
           (
             $10,
             jsonb_build_object(
               'enabled', $5,
               'emergencyStop', $6,
               'termsAccepted', $7
             )
           )
       ) AS audit(action, metadata)
       RETURNING id
     )
     SELECT provider, enabled, emergency_stop, terms_accepted_at
     FROM provider_setting`,
    [
      body.clientId,
      featureKey,
      body.entitlementStatus,
      body.provider,
      body.enabled,
      body.emergencyStop,
      body.acceptProviderTerms,
      actorId,
      body.reason,
      configurationAction,
    ],
  )

  if (!result) {
    throw createError({ statusCode: 500, statusMessage: 'Provider configuration was not persisted' })
  }

  return {
    ok: true,
    provider: result.provider,
    entitlement: {
      featureKey,
      status: body.entitlementStatus,
    },
    configuration: {
      enabled: result.enabled,
      emergencyStop: result.emergency_stop,
      termsAcceptedAt: result.terms_accepted_at,
    },
    clientAuthorizationRequired: true,
  }
})

