import { requirePersonaReadAccess } from '~~/server/utils/persona/access'
import { listPersonaActivationRequests } from '~~/server/utils/persona/activation'
import {
  listPersonaAudienceProviderState,
  personaProviderWritesEnabled
} from '~~/server/utils/persona/audienceSync'
import { resolveClientEntitlement } from '~~/server/utils/billing/entitlements'
import { queryRows } from '~~/server/utils/db'

type Provider = 'google_ads' | 'meta'

interface AuthorizationRow {
  provider: Provider
  status: string
  accepted_at: string | null
  withdrawn_at: string | null
}

interface ConnectionRow {
  provider: Provider
  active_connections: string
  data_manager_ready: boolean | null
}

interface SettingRow {
  provider: Provider
  enabled: boolean
  emergency_stop: boolean
  terms_accepted_at: string | null
  validated_at: string | null
  last_error: string | null
}

export default defineEventHandler(async (event) => {
  await requirePersonaReadAccess(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const clientId = String(getQuery(event).clientId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid clientId is required' })
  }
  const providers: Provider[] = ['google_ads', 'meta']
  const [
    identityEntitlement,
    googleEntitlement,
    metaEntitlement,
    authorizations,
    connections,
    settings
  ] = await Promise.all([
    resolveClientEntitlement(clientId, 'persona.identity'),
    resolveClientEntitlement(clientId, 'audience.google'),
    resolveClientEntitlement(clientId, 'audience.meta'),
    queryRows<AuthorizationRow>(
      `SELECT provider, status, accepted_at, withdrawn_at
         FROM crm_persona_audience_client_authorizations
        WHERE client_id = $1`,
      [clientId]
    ),
    queryRows<ConnectionRow>(
      `SELECT CASE
                WHEN LOWER(platform) LIKE '%google%' THEN 'google_ads'
                WHEN LOWER(platform) LIKE '%meta%' OR LOWER(platform) LIKE '%facebook%' THEN 'meta'
              END AS provider,
              COUNT(*) FILTER (WHERE status = 'active') AS active_connections,
              BOOL_OR(
                LOWER(platform) LIKE '%google%'
                AND status = 'active'
                AND scopes::text ILIKE '%datamanager%'
              ) AS data_manager_ready
         FROM social_connections
        WHERE client_id = $1
          AND (
            LOWER(platform) LIKE '%google%'
            OR LOWER(platform) LIKE '%meta%'
            OR LOWER(platform) LIKE '%facebook%'
          )
        GROUP BY 1`,
      [clientId]
    ),
    queryRows<SettingRow>(
      `SELECT provider, enabled, emergency_stop, terms_accepted_at,
              validated_at, last_error
         FROM crm_persona_audience_provider_settings
        WHERE client_id = $1`,
      [clientId]
    )
  ])
  const authorizationByProvider = new Map(authorizations.map(row => [row.provider, row]))
  const connectionByProvider = new Map(connections.map(row => [row.provider, row]))
  const settingByProvider = new Map(settings.map(row => [row.provider, row]))
  const audienceEntitlements = {
    google_ads: googleEntitlement,
    meta: metaEntitlement
  }
  const providerReadiness = providers.map((provider) => {
    const authorization = authorizationByProvider.get(provider)
    const connection = connectionByProvider.get(provider)
    const setting = settingByProvider.get(provider)
    const clientAuthorized = Boolean(
      authorization?.status === 'accepted'
      && authorization.accepted_at
      && !authorization.withdrawn_at
    )
    const connectionReady = provider === 'google_ads'
      ? Number(connection?.active_connections ?? 0) > 0 && connection?.data_manager_ready === true
      : Number(connection?.active_connections ?? 0) > 0
    const audienceEntitlement = audienceEntitlements[provider]
    const requestReady = identityEntitlement.enabled && audienceEntitlement.enabled
    const dispatchReady = Boolean(
      requestReady
      && clientAuthorized
      && connectionReady
      && setting?.enabled
      && setting.terms_accepted_at
      && !setting.emergency_stop
      && personaProviderWritesEnabled(provider)
    )
    return {
      provider,
      identityEntitlement: identityEntitlement.status,
      audienceEntitlement: audienceEntitlement.status,
      clientAuthorization: authorization?.status ?? 'pending',
      connectionReady,
      providerConfigured: Boolean(setting?.enabled),
      termsAccepted: Boolean(setting?.terms_accepted_at),
      emergencyStopped: setting?.emergency_stop ?? false,
      globalWritesEnabled: personaProviderWritesEnabled(provider),
      validatedAt: setting?.validated_at ?? null,
      lastError: setting?.last_error ?? null,
      requestReady,
      dispatchReady
    }
  })
  return {
    items: await listPersonaActivationRequests(clientId),
    providerDispatchEnabled: personaProviderWritesEnabled(),
    providerState: await listPersonaAudienceProviderState(clientId),
    providerReadiness
  }
})
