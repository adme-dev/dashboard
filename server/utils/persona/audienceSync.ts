import type { H3Event } from 'h3'
import { createError } from 'h3'
import { execute, queryOne, queryRows } from '~~/server/utils/db'
import { enqueue } from '~~/server/utils/queue'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow
} from '~~/server/utils/googleCredentialProfiles'
import { refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import {
  createGoogleCustomerMatchAudience,
  createMetaCustomAudience,
  getGoogleDataManagerRequestStatus,
  hashAudienceMember,
  mutateGoogleCustomerMatchAudience,
  mutateMetaCustomAudience,
  type HashedAudienceMember
} from './audienceProviders'

type Provider = 'google_ads' | 'meta'
type Operation = 'sync' | 'remove'

interface ActivationRequest {
  id: string
  client_id: string
  provider: Provider
  name: string
  filters: Record<string, string>
  minimum_size: number
  status: string
}

interface ExportContext {
  id: string
  client_id: string
  request_id: string
  provider: Provider
  operation: Operation
  status: string
  provider_request_ids: string[]
  request_name: string
  request_status: string
  filters: Record<string, string>
  minimum_size: number
  connection_id: string
  provider_audience_id: string | null
  enabled: boolean
  emergency_stop: boolean
  terms_accepted_at: string | null
}

interface ProviderConnection extends GoogleCredentialRow {
  id: string
  platform: string
  account_id: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  scopes: string[] | null
  metadata: Record<string, string> | null
  manager_customer_id: string | null
  profile_scopes: string[] | null
}

interface SourceMember {
  profile_id: string
  email: string | null
  phone: string | null
}

interface StoredMember {
  profile_id: string
  email_hash: string | null
  phone_hash: string | null
  member_fingerprint: string
}

const GOOGLE_DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager'

export function personaProviderWritesEnabled(provider?: Provider): boolean {
  if (process.env.PERSONA_AUDIENCE_PROVIDER_WRITES_ENABLED !== 'true') return false
  if (provider === 'meta') return process.env.PERSONA_META_AUDIENCE_WRITES_ENABLED === 'true'
  if (provider === 'google_ads') return process.env.PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED === 'true'
  return true
}

function providerPlatform(provider: Provider): 'google' | 'meta' {
  return provider === 'google_ads' ? 'google' : 'meta'
}

function redactError(error: unknown): { code: string, message: string } {
  const value = error as { code?: string, statusCode?: number, message?: string }
  return {
    code: String(value?.code || value?.statusCode || 'PROVIDER_SYNC_FAILED').slice(0, 80),
    message: String(value?.message || error || 'Provider sync failed').slice(0, 1000)
  }
}

async function audit(input: {
  clientId: string
  requestId: string
  exportId?: string | null
  provider: Provider
  action: string
  actorId?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
}) {
  await execute(
    `INSERT INTO crm_persona_audience_provider_audit (
       client_id, request_id, export_id, provider, action, actor_id, reason, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.clientId,
      input.requestId,
      input.exportId ?? null,
      input.provider,
      input.action,
      input.actorId ?? null,
      input.reason ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  )
}

async function resolveConnection(
  clientId: string,
  provider: Provider,
  configuredConnectionId?: string | null
): Promise<string> {
  if (configuredConnectionId) {
    const configured = await queryOne<{ id: string }>(
      `SELECT id FROM social_connections
        WHERE id = $1 AND client_id = $2 AND platform = $3 AND status = 'active'`,
      [configuredConnectionId, clientId, providerPlatform(provider)]
    )
    if (configured) return configured.id
  }
  const connections = await queryRows<{ id: string }>(
    `SELECT id FROM social_connections
      WHERE client_id = $1 AND platform = $2 AND status = 'active'
      ORDER BY updated_at DESC LIMIT 2`,
    [clientId, providerPlatform(provider)]
  )
  if (!connections.length) {
    throw createError({
      statusCode: 409,
      statusMessage: `No active ${provider === 'google_ads' ? 'Google Ads' : 'Meta'} connection is mapped to this client`
    })
  }
  if (connections.length > 1) {
    throw createError({
      statusCode: 409,
      statusMessage: `Multiple ${provider === 'google_ads' ? 'Google Ads' : 'Meta'} connections are mapped to this client`
    })
  }
  return connections[0]!.id
}

async function enableProviderSetting(request: ActivationRequest, actorId: string): Promise<void> {
  const existing = await queryOne<{ connection_id: string | null, emergency_stop: boolean }>(
    `SELECT connection_id, emergency_stop
       FROM crm_persona_audience_provider_settings
      WHERE client_id = $1 AND provider = $2`,
    [request.client_id, request.provider]
  )
  if (existing?.emergency_stop) {
    throw createError({ statusCode: 409, statusMessage: 'Provider activation is emergency-stopped for this client' })
  }
  const connectionId = await resolveConnection(request.client_id, request.provider, existing?.connection_id)
  await execute(
    `INSERT INTO crm_persona_audience_provider_settings (
       client_id, provider, connection_id, enabled, terms_accepted_at, terms_accepted_by, updated_at
     ) VALUES ($1, $2, $3, TRUE, NOW(), $4, NOW())
     ON CONFLICT (client_id, provider) DO UPDATE
       SET connection_id = EXCLUDED.connection_id,
           enabled = TRUE,
           terms_accepted_at = COALESCE(
             crm_persona_audience_provider_settings.terms_accepted_at,
             EXCLUDED.terms_accepted_at
           ),
           terms_accepted_by = COALESCE(
             crm_persona_audience_provider_settings.terms_accepted_by,
             EXCLUDED.terms_accepted_by
           ),
           last_error = NULL,
           updated_at = NOW()`,
    [request.client_id, request.provider, connectionId, actorId]
  )
}

export async function queuePersonaAudienceOperation(input: {
  event: H3Event
  clientId: string
  requestId: string
  operation: Operation
  actorId: string
  acceptProviderTerms?: boolean
}) {
  const request = await queryOne<ActivationRequest>(
    `SELECT id, client_id, provider, name, filters, minimum_size, status
       FROM crm_persona_audience_activation_requests
      WHERE id = $1 AND client_id = $2`,
    [input.requestId, input.clientId]
  )
  if (!request) throw createError({ statusCode: 404, statusMessage: 'Activation request not found' })
  if (input.operation === 'remove') {
    // Removal must always stay reachable, including for a cancelled request —
    // provider members from a request that was later cancelled still need a way
    // to be torn down; only a still-pending request has nothing to remove yet.
    if (!['approved', 'cancelled'].includes(request.status)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Removal is only available once a request has been approved or cancelled'
      })
    }
  } else if (request.status !== 'approved') {
    throw createError({ statusCode: 409, statusMessage: 'Two-person approval is required before provider dispatch' })
  }
  if (input.operation === 'sync') {
    if (input.acceptProviderTerms) {
      await enableProviderSetting(request, input.actorId)
    } else {
      const setting = await queryOne<{ terms_accepted_at: string | null }>(
        `SELECT terms_accepted_at FROM crm_persona_audience_provider_settings
          WHERE client_id = $1 AND provider = $2`,
        [request.client_id, request.provider]
      )
      if (!setting?.terms_accepted_at) {
        throw createError({ statusCode: 400, statusMessage: 'Provider Customer Match terms must be accepted' })
      }
    }
  }

  const row = await queryOne<{ id: string }>(
    `INSERT INTO crm_persona_audience_exports (
       client_id, request_id, provider, operation, idempotency_key, queued_by
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.clientId,
      input.requestId,
      request.provider,
      input.operation,
      `${input.requestId}:${input.operation}:${crypto.randomUUID()}`,
      input.actorId
    ]
  )
  if (!row) throw new Error('Audience export was not created')
  await audit({
    clientId: input.clientId,
    requestId: input.requestId,
    exportId: row.id,
    provider: request.provider,
    action: input.operation === 'remove' ? 'removal_queued' : 'dispatch_queued',
    actorId: input.actorId,
    reason: input.operation === 'remove'
      ? 'Provider audience removal requested'
      : 'Approved provider audience sync queued'
  })
  const queued = await enqueue(
    input.event,
    'persona.audience.sync',
    { exportId: row.id, clientId: input.clientId },
    () => runPersonaAudienceSync(row.id)
  )
  return { id: row.id, status: 'queued', queued }
}

export async function listPersonaAudienceProviderState(clientId: string) {
  const settings = await queryRows(
    `SELECT setting.provider,
            setting.connection_id AS "connectionId",
            connection.account_name AS "connectionName",
            setting.provider_audience_id AS "providerAudienceId",
            setting.enabled,
            setting.emergency_stop AS "emergencyStop",
            setting.terms_accepted_at AS "termsAcceptedAt",
            setting.validated_at AS "validatedAt",
            setting.last_synced_at AS "lastSyncedAt",
            setting.last_error AS "lastError"
       FROM crm_persona_audience_provider_settings setting
       LEFT JOIN social_connections connection ON connection.id = setting.connection_id
      WHERE setting.client_id = $1
      ORDER BY setting.provider`,
    [clientId]
  )
  const exports = await queryRows(
    `SELECT DISTINCT ON (request_id)
            id, request_id AS "requestId", provider, operation, status,
            attempted_additions AS "attemptedAdditions",
            attempted_removals AS "attemptedRemovals",
            successful_additions AS "successfulAdditions",
            successful_removals AS "successfulRemovals",
            error_message AS "errorMessage",
            queued_at AS "queuedAt", completed_at AS "completedAt"
       FROM crm_persona_audience_exports
      WHERE client_id = $1
      ORDER BY request_id, queued_at DESC`,
    [clientId]
  )
  return {
    globalEnabled: personaProviderWritesEnabled(),
    providers: {
      google_ads: personaProviderWritesEnabled('google_ads'),
      meta: personaProviderWritesEnabled('meta')
    },
    settings,
    exports
  }
}

async function loadExportContext(exportId: string): Promise<ExportContext | null> {
  return queryOne<ExportContext>(
    `SELECT export.id, export.client_id, export.request_id, export.provider,
            export.operation, export.status, export.provider_request_ids,
            request.name AS request_name, request.status AS request_status,
            request.filters, request.minimum_size,
            setting.connection_id, setting.provider_audience_id,
            setting.enabled, setting.emergency_stop, setting.terms_accepted_at
       FROM crm_persona_audience_exports export
       JOIN crm_persona_audience_activation_requests request
         ON request.id = export.request_id AND request.client_id = export.client_id
       JOIN crm_persona_audience_provider_settings setting
         ON setting.client_id = export.client_id AND setting.provider = export.provider
      WHERE export.id = $1`,
    [exportId]
  )
}

async function loadProviderConnection(context: ExportContext): Promise<ProviderConnection> {
  const row = await queryOne<ProviderConnection>(
    `SELECT sc.id, sc.platform, sc.account_id, sc.access_token, sc.refresh_token,
            sc.token_expires_at, sc.scopes, sc.metadata,
            account.manager_customer_id,
            gcp.scopes AS profile_scopes,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
       FROM social_connections sc
       ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
       LEFT JOIN google_credential_profile_accounts account
         ON account.connection_id = sc.id
        AND account.profile_id = sc.google_credential_profile_id
      WHERE sc.id = $1
        AND sc.client_id = $2
        AND sc.platform = $3
        AND sc.status = 'active'`,
    [context.connection_id, context.client_id, providerPlatform(context.provider)]
  )
  if (!row) throw new Error('Configured provider connection is unavailable')
  return row
}

function signalFilterSql(filters: Record<string, string>, params: unknown[]): string {
  const clauses = [
    'signal.client_id = $1',
    'signal.profile_id IS NOT NULL',
    `signal.consent_marketing = 'granted'`
  ]
  const add = (sql: string, value: string) => {
    params.push(value)
    clauses.push(sql.replace('?', `$${params.length}`))
  }
  if (filters.startDate) add('signal.occurred_at >= ?::date', filters.startDate)
  if (filters.endDate) add(`signal.occurred_at < (?::date + INTERVAL '1 day')`, filters.endDate)
  const fields: Array<[string, string[]]> = [
    ['platform', ['platform', 'utm_source', 'source']],
    ['campaignId', ['campaignId', 'campaign_id', 'utm_campaign']],
    ['adGroupId', ['adGroupId', 'ad_group_id']],
    ['adSetId', ['adSetId', 'ad_set_id']],
    ['adId', ['adId', 'ad_id']],
    ['creativeId', ['creativeId', 'creative_id']],
    ['landingPage', ['landingPage', 'landing_page', 'page_url']],
    ['device', ['device', 'device_type']]
  ]
  for (const [filterKey, contextKeys] of fields) {
    if (!filters[filterKey]) continue
    const expression = contextKeys.map(key => `NULLIF(signal.context->>'${key}', '')`).join(', ')
    add(`LOWER(COALESCE(${expression}, '')) = LOWER(?)`, filters[filterKey])
  }
  return clauses.join('\n AND ')
}

export async function loadEligibleMembers(context: ExportContext): Promise<HashedAudienceMember[]> {
  const filters = context.filters || {}
  const params: unknown[] = [context.client_id]
  const candidatesFilterSql = signalFilterSql(filters, params)
  let candidateJoinSql = ''
  if (filters.tierKey) {
    params.push(filters.tierKey)
    candidateJoinSql = `JOIN crm_persona_tier_memberships tier
                           ON tier.client_id = signal.client_id
                          AND tier.profile_id = signal.profile_id
                          AND tier.tier_key = $${params.length}`
  } else if (filters.excludeAudience === 'true') {
    candidateJoinSql = `JOIN crm_persona_exclusion_memberships excl
                           ON excl.client_id = signal.client_id
                          AND excl.profile_id = signal.profile_id`
  }
  params.push(context.provider)
  const destinationParamIndex = params.length
  const candidatesFromSql = candidateJoinSql
    ? `FROM crm_customer_signals signal\n         ${candidateJoinSql}`
    : 'FROM crm_customer_signals signal'
  const rows = await queryRows<SourceMember>(
    `WITH candidates AS (
       SELECT DISTINCT signal.profile_id
         ${candidatesFromSql}
        WHERE ${candidatesFilterSql}
     ),
     latest_consent AS (
       SELECT DISTINCT ON (history.profile_id) history.profile_id, history.marketing
         FROM crm_consent_history history
         JOIN candidates candidate ON candidate.profile_id = history.profile_id
        WHERE history.client_id = $1
        ORDER BY history.profile_id, history.occurred_at DESC, history.created_at DESC
     ),
     latest_person AS (
       SELECT DISTINCT ON (identity_link.profile_id)
              identity_link.profile_id, person.email,
              COALESCE(NULLIF(person.mobile, ''), NULLIF(person.phone, '')) AS phone,
              person.do_not_contact, person.do_not_email
         FROM crm_lead_identity_links identity_link
         JOIN lead_crm_links crm_link
           ON crm_link.client_id = identity_link.client_id
          AND crm_link.lead_id = identity_link.lead_id
         JOIN crm_people person
           ON person.client_id = crm_link.client_id
          AND person.id = crm_link.person_id
          AND person.deleted_at IS NULL
         JOIN candidates candidate ON candidate.profile_id = identity_link.profile_id
        WHERE identity_link.client_id = $1
        ORDER BY identity_link.profile_id, person.updated_at DESC
     ),
     latest_lead AS (
       SELECT DISTINCT ON (identity_link.profile_id)
              identity_link.profile_id,
              COALESCE(NULLIF(lead.field_data->>'email', ''), NULLIF(lead.field_data->>'email_address', '')) AS email,
              COALESCE(
                NULLIF(lead.field_data->>'mobile', ''),
                NULLIF(lead.field_data->>'phone_number', ''),
                NULLIF(lead.field_data->>'phone', '')
              ) AS phone
         FROM crm_lead_identity_links identity_link
         JOIN leads lead
           ON lead.client_id = identity_link.client_id
          AND lead.id = identity_link.lead_id
          AND lead.deleted_at IS NULL
         JOIN candidates candidate ON candidate.profile_id = identity_link.profile_id
        WHERE identity_link.client_id = $1
        ORDER BY identity_link.profile_id, lead.submitted_at DESC
     )
     SELECT candidate.profile_id,
            COALESCE(person.email, lead.email) AS email,
            COALESCE(person.phone, lead.phone) AS phone
       FROM candidates candidate
       JOIN latest_consent consent
         ON consent.profile_id = candidate.profile_id AND consent.marketing = 'granted'
       LEFT JOIN latest_person person ON person.profile_id = candidate.profile_id
       LEFT JOIN latest_lead lead ON lead.profile_id = candidate.profile_id
      WHERE COALESCE(person.do_not_contact, FALSE) = FALSE
        AND COALESCE(person.do_not_email, FALSE) = FALSE
        AND (COALESCE(person.email, lead.email) IS NOT NULL
          OR COALESCE(person.phone, lead.phone) IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM crm_persona_current_suppressions suppression
           WHERE suppression.client_id = $1
             AND suppression.profile_id = candidate.profile_id
             AND suppression.purpose IN ('marketing', 'all')
             AND suppression.channel IN ('ads', 'all')
             AND suppression.destination IN ($${destinationParamIndex}, 'all')
        )`,
    params
  )
  const members = await Promise.all(rows.map(row => hashAudienceMember({
    profileId: row.profile_id,
    email: row.email,
    phone: row.phone
  })))
  return members.filter((member): member is HashedAudienceMember => member !== null)
}

// Upper-bound estimate only: applies just the attribution/consent-marketing gates from
// signalFilterSql, not the additional latest-consent/do-not-contact/contactability/suppression
// gates loadEligibleMembers applies at export time — the real deliverable audience is smaller.
export async function countTierMembers(
  clientId: string,
  tierKey: string,
  filters: Record<string, string>
): Promise<number> {
  const params: unknown[] = [clientId]
  const filterSql = signalFilterSql(filters, params)
  params.push(tierKey)
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(DISTINCT signal.profile_id) AS count
       FROM crm_customer_signals signal
       JOIN crm_persona_tier_memberships tier
         ON tier.client_id = signal.client_id
        AND tier.profile_id = signal.profile_id
        AND tier.tier_key = $${params.length}
      WHERE ${filterSql}`,
    params
  )
  return Number(row?.count ?? 0)
}

// Upper-bound estimate only: applies just the attribution/consent-marketing gates from
// signalFilterSql, not the additional latest-consent/do-not-contact/contactability/suppression
// gates loadEligibleMembers applies at export time — the real deliverable audience is smaller.
export async function countExclusionMembers(
  clientId: string,
  filters: Record<string, string>
): Promise<number> {
  const params: unknown[] = [clientId]
  const filterSql = signalFilterSql(filters, params)
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(DISTINCT signal.profile_id) AS count
       FROM crm_customer_signals signal
       JOIN crm_persona_exclusion_memberships excl
         ON excl.client_id = signal.client_id
        AND excl.profile_id = signal.profile_id
      WHERE ${filterSql}`,
    params
  )
  return Number(row?.count ?? 0)
}

async function loadStoredMembers(context: ExportContext): Promise<StoredMember[]> {
  return queryRows<StoredMember>(
    `SELECT profile_id, email_hash, phone_hash, member_fingerprint
       FROM crm_persona_audience_member_state
      WHERE client_id = $1 AND request_id = $2 AND provider = $3 AND active = TRUE`,
    [context.client_id, context.request_id, context.provider]
  )
}

function toHashedMember(member: StoredMember): HashedAudienceMember {
  return {
    profileId: member.profile_id,
    emailHash: member.email_hash,
    phoneHash: member.phone_hash,
    fingerprint: member.member_fingerprint
  }
}

async function recordPendingMembers(
  context: ExportContext,
  additions: HashedAudienceMember[],
  removals: HashedAudienceMember[]
) {
  const rows = [
    ...additions.map(member => ({ ...member, operation: 'add' })),
    ...removals.map(member => ({ ...member, operation: 'remove' }))
  ]
  if (!rows.length) return
  await execute(
    `INSERT INTO crm_persona_audience_export_members (
       export_id, client_id, request_id, profile_id, operation,
       member_fingerprint, email_hash, phone_hash
     )
     SELECT $1, $2, $3, item.profile_id::uuid, item.operation,
            item.fingerprint, item.email_hash, item.phone_hash
       FROM jsonb_to_recordset($4::jsonb) AS item(
         profile_id text, operation text, fingerprint text, email_hash text, phone_hash text
       )
     ON CONFLICT (export_id, profile_id, operation) DO NOTHING`,
    [context.id, context.client_id, context.request_id, JSON.stringify(rows.map(row => ({
      profile_id: row.profileId,
      operation: row.operation,
      fingerprint: row.fingerprint,
      email_hash: row.emailHash,
      phone_hash: row.phoneHash
    })))]
  )
}

async function applySuccessfulMembers(context: ExportContext) {
  await execute(
    `INSERT INTO crm_persona_audience_member_state (
       client_id, request_id, provider, profile_id, member_fingerprint,
       email_hash, phone_hash, active, last_export_id, activated_at, removed_at, updated_at
     )
     SELECT member.client_id, member.request_id, $2, member.profile_id,
            member.member_fingerprint, member.email_hash, member.phone_hash,
            TRUE, member.export_id, NOW(), NULL, NOW()
       FROM crm_persona_audience_export_members member
      WHERE member.export_id = $1 AND member.operation = 'add'
     ON CONFLICT (request_id, profile_id) DO UPDATE
       SET member_fingerprint = EXCLUDED.member_fingerprint,
           email_hash = EXCLUDED.email_hash,
           phone_hash = EXCLUDED.phone_hash,
           active = TRUE,
           last_export_id = EXCLUDED.last_export_id,
           removed_at = NULL,
           updated_at = NOW()`,
    [context.id, context.provider]
  )
  await execute(
    `UPDATE crm_persona_audience_member_state state
        SET active = FALSE, removed_at = NOW(), last_export_id = $1, updated_at = NOW()
       FROM crm_persona_audience_export_members member
      WHERE member.export_id = $1 AND member.operation = 'remove'
        AND state.request_id = member.request_id AND state.profile_id = member.profile_id`,
    [context.id]
  )
  await execute(
    `UPDATE crm_persona_audience_export_members
        SET status = 'succeeded', updated_at = NOW()
      WHERE export_id = $1`,
    [context.id]
  )
}

async function usableGoogleCredential(connection: ProviderConnection) {
  const credential = await resolveGoogleCredential(connection)
  const scopes = connection.profile_scopes?.length ? connection.profile_scopes : connection.scopes
  if (!scopes?.includes(GOOGLE_DATA_MANAGER_SCOPE)) {
    throw new Error('Google connection must be reconnected with the Data Manager OAuth scope')
  }
  let accessToken = credential.accessToken
  if (
    credential.refreshToken
    && credential.tokenExpiresAt
    && new Date(credential.tokenExpiresAt).getTime() <= Date.now() + 5 * 60 * 1000
  ) {
    const config = useRuntimeConfig()
    const refreshed = await refreshGoogleToken(
      credential.refreshToken,
      String(config.googleClientId),
      String(config.googleClientSecret)
    )
    accessToken = refreshed.access_token
    await persistGoogleCredentialRefresh({
      connectionId: connection.id,
      profileId: credential.profileId,
      accessToken,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000)
    })
  }
  return accessToken
}

async function ensureProviderAudience(
  context: ExportContext,
  connection: ProviderConnection,
  accessToken: string
): Promise<string> {
  if (context.provider_audience_id) return context.provider_audience_id
  const name = `XeroFlow - ${context.request_name} - ${context.request_id.slice(0, 8)}`
  let audienceId: string
  if (context.provider === 'meta') {
    audienceId = await createMetaCustomAudience({
      accessToken,
      accountId: connection.account_id,
      name,
      description: `Consent-governed XeroFlow persona cohort ${context.request_id}`
    })
  } else {
    const loginCustomerId = connection.manager_customer_id
      || connection.metadata?.managerCustomerId
      || connection.metadata?.loginCustomerId
      || null
    await createGoogleCustomerMatchAudience({
      accessToken,
      customerId: connection.account_id,
      loginCustomerId,
      name,
      description: `Consent-governed XeroFlow persona cohort ${context.request_id}`,
      integrationCode: context.request_id,
      validateOnly: true
    })
    const created = await createGoogleCustomerMatchAudience({
      accessToken,
      customerId: connection.account_id,
      loginCustomerId,
      name,
      description: `Consent-governed XeroFlow persona cohort ${context.request_id}`,
      integrationCode: context.request_id
    })
    if (!created.id) throw new Error('Google Data Manager did not return a Customer Match list ID')
    audienceId = created.id
  }
  await execute(
    `UPDATE crm_persona_audience_provider_settings
        SET provider_audience_id = $3, validated_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE client_id = $1 AND provider = $2`,
    [context.client_id, context.provider, audienceId]
  )
  await audit({
    clientId: context.client_id,
    requestId: context.request_id,
    exportId: context.id,
    provider: context.provider,
    action: 'provider_validated',
    reason: 'Provider destination validated and audience resolved',
    metadata: { providerAudienceId: audienceId }
  })
  return audienceId
}

async function submitProviderChanges(
  context: ExportContext,
  connection: ProviderConnection,
  accessToken: string,
  audienceId: string,
  additions: HashedAudienceMember[],
  removals: HashedAudienceMember[]
): Promise<string[]> {
  if (context.provider === 'meta') {
    if (removals.length) {
      await mutateMetaCustomAudience({
        accessToken, audienceId, operation: 'remove', members: removals
      })
    }
    if (additions.length) {
      await mutateMetaCustomAudience({
        accessToken, audienceId, operation: 'add', members: additions
      })
    }
    return []
  }
  const loginCustomerId = connection.manager_customer_id
    || connection.metadata?.managerCustomerId
    || connection.metadata?.loginCustomerId
    || null
  const requestIds: string[] = []
  if (removals.length) {
    requestIds.push(...await mutateGoogleCustomerMatchAudience({
      accessToken,
      customerId: connection.account_id,
      loginCustomerId,
      audienceId,
      operation: 'remove',
      members: removals
    }))
  }
  if (additions.length) {
    requestIds.push(...await mutateGoogleCustomerMatchAudience({
      accessToken,
      customerId: connection.account_id,
      loginCustomerId,
      audienceId,
      operation: 'add',
      members: additions
    }))
  }
  return requestIds
}

async function finalizeSuccess(context: ExportContext) {
  await applySuccessfulMembers(context)
  const counts = await queryOne<{ additions: number, removals: number }>(
    `SELECT COUNT(*) FILTER (WHERE operation = 'add')::int AS additions,
            COUNT(*) FILTER (WHERE operation = 'remove')::int AS removals
       FROM crm_persona_audience_export_members WHERE export_id = $1`,
    [context.id]
  )
  await execute(
    `UPDATE crm_persona_audience_exports
        SET status = 'succeeded',
            successful_additions = $2,
            successful_removals = $3,
            error_code = NULL,
            error_message = NULL,
            completed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [context.id, counts?.additions ?? 0, counts?.removals ?? 0]
  )
  await execute(
    `UPDATE crm_persona_audience_provider_settings
        SET last_synced_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE client_id = $1 AND provider = $2`,
    [context.client_id, context.provider]
  )
  await audit({
    clientId: context.client_id,
    requestId: context.request_id,
    exportId: context.id,
    provider: context.provider,
    action: 'provider_succeeded',
    reason: 'Provider audience membership reconciled',
    metadata: { additions: counts?.additions ?? 0, removals: counts?.removals ?? 0 }
  })
}

async function reconcileSubmittedGoogleExport(
  context: ExportContext,
  accessToken: string
): Promise<boolean> {
  const statuses = await Promise.all(
    context.provider_request_ids.map(requestId => getGoogleDataManagerRequestStatus(accessToken, requestId))
  )
  if (statuses.some(item => item.status === 'PROCESSING' || item.status === 'REQUEST_STATUS_UNKNOWN')) {
    return false
  }
  if (statuses.some(item => item.status === 'FAILED')) {
    const error = new Error('Google Data Manager rejected the audience operation') as Error & { code?: string }
    error.code = 'GOOGLE_DATA_MANAGER_FAILED'
    throw error
  }
  if (statuses.some(item => item.status === 'PARTIAL_SUCCESS')) {
    await execute(
      `UPDATE crm_persona_audience_exports
          SET status = 'partial',
              error_code = 'GOOGLE_DATA_MANAGER_PARTIAL',
              error_message = 'Google accepted only part of the audience operation',
              metadata = metadata || $2::jsonb,
              completed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [context.id, JSON.stringify({ providerStatuses: statuses })]
    )
    await audit({
      clientId: context.client_id,
      requestId: context.request_id,
      exportId: context.id,
      provider: context.provider,
      action: 'provider_partial',
      reason: 'Google Data Manager returned partial success'
    })
    return true
  }
  await finalizeSuccess(context)
  return true
}

export async function runPersonaAudienceSync(exportId: string): Promise<void> {
  const context = await loadExportContext(exportId)
  if (!context) throw new Error('Persona audience export context is unavailable')
  try {
    // Removal is always permitted regardless of kill switches, emergency stop, terms
    // acceptance, or the activation request having since been cancelled — those gates
    // exist to control new PII flowing to a provider, and must never block pulling it
    // back out (mirrors the "always permitting removal exports" DB-layer intent in
    // migration 297's enforce_persona_audience_client_authorization trigger).
    if (context.operation === 'sync') {
      if (context.request_status !== 'approved') {
        throw new Error(`Activation request is no longer approved (status: ${context.request_status})`)
      }
      if (!personaProviderWritesEnabled(context.provider)) {
        throw new Error(`${context.provider} audience writes are disabled by the global kill switch`)
      }
      if (!context.enabled || context.emergency_stop) {
        throw new Error('Provider audience writes are disabled for this client')
      }
      if (!context.terms_accepted_at) throw new Error('Provider Customer Match terms have not been accepted')
    }
    const connection = await loadProviderConnection(context)
    const accessToken = context.provider === 'google_ads'
      ? await usableGoogleCredential(connection)
      : connection.access_token
    if (!accessToken) throw new Error('Provider access token is unavailable')

    if (context.status === 'submitted' && context.provider === 'google_ads') {
      const complete = await reconcileSubmittedGoogleExport(context, accessToken)
      if (!complete) {
        const pending = new Error('Google Data Manager request is still processing') as Error & { code?: string }
        pending.code = 'PROVIDER_PROCESSING'
        throw pending
      }
      return
    }

    await execute(
      `UPDATE crm_persona_audience_exports
          SET status = 'running',
              attempt_count = attempt_count + 1,
              started_at = COALESCE(started_at, NOW()),
              updated_at = NOW()
        WHERE id = $1`,
      [exportId]
    )
    await audit({
      clientId: context.client_id,
      requestId: context.request_id,
      exportId: context.id,
      provider: context.provider,
      action: 'dispatch_started',
      reason: 'Provider audience reconciliation started'
    })

    const stored = await loadStoredMembers(context)
    const current = context.operation === 'remove' ? [] : await loadEligibleMembers(context)
    const belowKAnonymityFloor = context.operation === 'sync' && current.length < context.minimum_size
    const storedByProfile = new Map(stored.map(member => [member.profile_id, member]))
    const currentByProfile = new Map(current.map(member => [member.profileId, member]))
    // The k-anonymity floor only protects *new* additions to a too-small segment — it
    // must never block removing members who withdrew consent or became ineligible,
    // otherwise a shrinking cohort permanently deadlocks its own consent teardown
    // (the exact shape of the bug migration 307 already fixed one layer down).
    const additions = belowKAnonymityFloor
      ? []
      : current.filter((member) => {
          const prior = storedByProfile.get(member.profileId)
          return !prior || prior.member_fingerprint !== member.fingerprint
        })
    const removals = stored
      .filter((member) => {
        const currentMember = currentByProfile.get(member.profile_id)
        return !currentMember || currentMember.fingerprint !== member.member_fingerprint
      })
      .map(toHashedMember)

    await recordPendingMembers(context, additions, removals)
    await execute(
      `UPDATE crm_persona_audience_exports
          SET attempted_additions = $2, attempted_removals = $3, updated_at = NOW()
        WHERE id = $1`,
      [context.id, additions.length, removals.length]
    )
    if (!additions.length && !removals.length) {
      await finalizeSuccess(context)
      return
    }

    const audienceId = await ensureProviderAudience(context, connection, accessToken)
    const requestIds = await submitProviderChanges(
      context, connection, accessToken, audienceId, additions, removals
    )
    if (context.provider === 'meta') {
      // Meta's Graph API confirms membership synchronously in the HTTP response itself
      // (unlike Google, there is no async request-status poll for this provider) — apply
      // the membership ledger now, before any other bookkeeping, so a failure in the
      // UPDATE below can never leave a provider-accepted member untracked in
      // crm_persona_audience_member_state and therefore permanently un-removable.
      // Safe to call again from finalizeSuccess() below — applySuccessfulMembers is
      // idempotent (upsert + deterministic-WHERE update).
      await applySuccessfulMembers(context)
    }
    await execute(
      `UPDATE crm_persona_audience_exports
          SET provider_audience_id = $2,
              provider_request_ids = $3::jsonb,
              status = CASE WHEN $4::int > 0 THEN 'submitted' ELSE 'running' END,
              submitted_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [context.id, audienceId, JSON.stringify(requestIds), requestIds.length]
    )
    await audit({
      clientId: context.client_id,
      requestId: context.request_id,
      exportId: context.id,
      provider: context.provider,
      action: 'provider_submitted',
      reason: 'Audience member changes submitted to provider',
      metadata: { additions: additions.length, removals: removals.length, requestCount: requestIds.length }
    })
    if (!requestIds.length) {
      await finalizeSuccess(context)
      return
    }
    const pending = new Error('Google Data Manager request submitted for reconciliation') as Error & { code?: string }
    pending.code = 'PROVIDER_PROCESSING'
    throw pending
  } catch (error) {
    const redacted = redactError(error)
    if (redacted.code === 'PROVIDER_PROCESSING') throw error
    await execute(
      `UPDATE crm_persona_audience_exports
          SET status = 'failed', error_code = $2, error_message = $3,
              completed_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [exportId, redacted.code, redacted.message]
    )
    await execute(
      `UPDATE crm_persona_audience_provider_settings
          SET last_error = $3, updated_at = NOW()
        WHERE client_id = $1 AND provider = $2`,
      [context.client_id, context.provider, redacted.message]
    )
    await audit({
      clientId: context.client_id,
      requestId: context.request_id,
      exportId: context.id,
      provider: context.provider,
      action: 'provider_failed',
      reason: redacted.message,
      metadata: { errorCode: redacted.code }
    })
    throw error
  }
}
