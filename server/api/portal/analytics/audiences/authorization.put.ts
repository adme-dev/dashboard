import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

const POLICY_VERSION = 'persona-audience-client-v1'
const PROVIDERS = new Set(['google_ads', 'meta'])

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  if (!client.isPrimaryContact && !client.permissions.canApproveWork) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Primary contact or approval permission required'
    })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const provider = String(body?.provider || '')
  const action = String(body?.action || '')
  if (!PROVIDERS.has(provider)) {
    throw createError({ statusCode: 400, statusMessage: 'provider must be google_ads or meta' })
  }
  if (action !== 'accept' && action !== 'withdraw') {
    throw createError({ statusCode: 400, statusMessage: 'action must be accept or withdraw' })
  }

  const privacyNoticeUrl = typeof body?.privacyNoticeUrl === 'string'
    ? body.privacyNoticeUrl.trim().slice(0, 2048)
    : null
  if (privacyNoticeUrl) {
    try {
      const parsed = new URL(privacyNoticeUrl)
      if (parsed.protocol !== 'https:') throw new Error('HTTPS required')
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'privacyNoticeUrl must be a valid HTTPS URL' })
    }
  }

  const attestations = {
    dataOwnership: body?.dataOwnership === true,
    privacyNotice: body?.privacyNotice === true,
    providerTerms: body?.providerTerms === true,
    personConsentSeparate: body?.personConsentSeparate === true
  }
  if (action === 'accept' && Object.values(attestations).some(value => !value)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'All authorization attestations are required'
    })
  }

  const status = action === 'accept' ? 'accepted' : 'withdrawn'
  const result = await queryOne(`
    WITH changed AS (
      INSERT INTO crm_persona_audience_client_authorizations (
        client_id, provider, status, policy_version, privacy_notice_url,
        attestations, authorized_by, accepted_at, withdrawn_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7,
        CASE WHEN $3 = 'accepted' THEN NOW() ELSE NULL END,
        CASE WHEN $3 = 'withdrawn' THEN NOW() ELSE NULL END
      )
      ON CONFLICT (client_id, provider) DO UPDATE SET
        status = EXCLUDED.status,
        policy_version = EXCLUDED.policy_version,
        privacy_notice_url = EXCLUDED.privacy_notice_url,
        attestations = EXCLUDED.attestations,
        authorized_by = EXCLUDED.authorized_by,
        accepted_at = CASE WHEN EXCLUDED.status = 'accepted' THEN NOW() ELSE NULL END,
        withdrawn_at = CASE WHEN EXCLUDED.status = 'withdrawn' THEN NOW() ELSE NULL END,
        updated_at = NOW()
      RETURNING *
    ), audit AS (
      INSERT INTO crm_persona_audience_client_authorization_events (
        authorization_id, client_id, provider, action, policy_version,
        client_user_id, metadata
      )
      SELECT id, client_id, provider, $8, policy_version, $7,
        jsonb_build_object(
          'privacyNoticeUrl', privacy_notice_url,
          'attestations', attestations,
          'source', 'client_portal'
        )
      FROM changed
      RETURNING id
    )
    SELECT changed.*, audit.id AS audit_id
    FROM changed CROSS JOIN audit
  `, [
    client.clientId,
    provider,
    status,
    POLICY_VERSION,
    privacyNoticeUrl,
    JSON.stringify(attestations),
    client.id,
    action === 'accept' ? 'accepted' : 'withdrawn'
  ])

  return {
    ok: true,
    provider,
    status,
    policyVersion: POLICY_VERSION,
    acceptedAt: result?.accepted_at || null,
    withdrawnAt: result?.withdrawn_at || null
  }
})
