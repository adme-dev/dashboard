import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

type CountRow = Record<string, any>

const numberValue = (value: unknown) => Number(value || 0)

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const clientId = client.clientId
  const [
    identityRows,
    consentRows,
    signalRows,
    sourceRows,
    personaRows,
    connectionRows,
    authorizationRows,
    activationRows
  ] = await Promise.all([
    queryRows<CountRow>(`
      WITH linked AS (
        SELECT DISTINCT profile_id
        FROM crm_identity_subject_links
        WHERE client_id = $1
      ), matchable AS (
        SELECT DISTINCT profile_id
        FROM crm_identity_keys
        WHERE client_id = $1 AND identity_type IN ('email', 'phone', 'mobile')
      )
      SELECT
        COUNT(*) AS total_profiles,
        COUNT(*) FILTER (WHERE linked.profile_id IS NOT NULL) AS linked_profiles,
        COUNT(*) FILTER (WHERE matchable.profile_id IS NOT NULL) AS matchable_profiles,
        MAX(profiles.last_seen_at) AS last_profile_seen_at
      FROM crm_identity_profiles profiles
      LEFT JOIN linked ON linked.profile_id = profiles.id
      LEFT JOIN matchable ON matchable.profile_id = profiles.id
      WHERE profiles.client_id = $1
    `, [clientId]),
    queryRows<CountRow>(`
      WITH latest AS (
        SELECT DISTINCT ON (profile_id)
          profile_id, marketing, occurred_at
        FROM crm_consent_history
        WHERE client_id = $1 AND profile_id IS NOT NULL
        ORDER BY profile_id, occurred_at DESC, created_at DESC
      ), eligible AS (
        SELECT DISTINCT latest.profile_id
        FROM latest
        JOIN crm_identity_keys identity_key
          ON identity_key.client_id = $1
         AND identity_key.profile_id = latest.profile_id
         AND identity_key.identity_type IN ('email', 'phone', 'mobile')
        LEFT JOIN crm_identity_subject_links subject_link
          ON subject_link.client_id = $1
         AND subject_link.profile_id = latest.profile_id
         AND subject_link.subject_type = 'crm_person'
        LEFT JOIN crm_people person
          ON person.client_id = $1
         AND subject_link.subject_id ~* '^[0-9a-f-]{36}$'
         AND person.id = subject_link.subject_id::uuid
        WHERE latest.marketing = 'granted'
          AND COALESCE(person.do_not_contact, false) = false
          AND COALESCE(person.do_not_email, false) = false
          AND person.deleted_at IS NULL
      )
      SELECT
        COUNT(*) AS recorded_profiles,
        COUNT(*) FILTER (WHERE marketing = 'granted') AS granted,
        COUNT(*) FILTER (WHERE marketing = 'denied') AS denied,
        COUNT(*) FILTER (WHERE marketing = 'unknown') AS unknown,
        (SELECT COUNT(*) FROM eligible) AS export_eligible,
        MAX(occurred_at) AS last_consent_at
      FROM latest
    `, [clientId]),
    queryRows<CountRow>(`
      SELECT
        COUNT(*) AS total_signals,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '30 days') AS recent_signals,
        COUNT(DISTINCT profile_id) AS signalled_profiles,
        COUNT(*) FILTER (WHERE product_id IS NOT NULL) AS product_signals,
        MAX(occurred_at) AS last_signal_at
      FROM crm_customer_signals
      WHERE client_id = $1
    `, [clientId]),
    queryRows<CountRow>(`
      SELECT source_type, COUNT(*) AS count, MAX(occurred_at) AS last_seen_at
      FROM crm_customer_signals
      WHERE client_id = $1
      GROUP BY source_type
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `, [clientId]),
    queryRows<CountRow>(`
      SELECT id, persona_key, version, label, description, min_confidence,
        allowed_channels, targeting_allowed, reporting_allowed, status, updated_at
      FROM crm_persona_definitions
      WHERE client_id = $1 AND status = 'active'
      ORDER BY targeting_allowed DESC, label ASC
    `, [clientId]),
    queryRows<CountRow>(`
      SELECT
        CASE
          WHEN LOWER(platform) LIKE '%google%' THEN 'google_ads'
          WHEN LOWER(platform) LIKE '%meta%' OR LOWER(platform) LIKE '%facebook%' THEN 'meta'
        END AS provider,
        COUNT(*) FILTER (WHERE status = 'active') AS active_connections,
        BOOL_OR(
          LOWER(platform) LIKE '%google%'
          AND status = 'active'
          AND scopes::text ILIKE '%datamanager%'
        ) AS data_manager_ready,
        MAX(updated_at) AS last_connected_at
      FROM social_connections
      WHERE client_id = $1
        AND (
          LOWER(platform) LIKE '%google%'
          OR LOWER(platform) LIKE '%meta%'
          OR LOWER(platform) LIKE '%facebook%'
        )
      GROUP BY 1
    `, [clientId]),
    queryRows<CountRow>(`
      SELECT client_auth.provider, client_auth.status, client_auth.policy_version,
        client_auth.data_use_scope, client_auth.privacy_notice_url,
        client_auth.accepted_at, client_auth.withdrawn_at, client_auth.updated_at,
        client_user.name AS authorized_by_name
      FROM crm_persona_audience_client_authorizations client_auth
      LEFT JOIN client_users client_user ON client_user.id = client_auth.authorized_by
      WHERE client_auth.client_id = $1
      ORDER BY client_auth.provider
    `, [clientId]),
    queryRows<CountRow>(`
      SELECT request.id, request.provider, request.name, request.status,
        request.estimated_size, request.minimum_size, request.blocked_reason,
        request.approved_at, request.updated_at,
        COALESCE(approval.approver_count, 0) AS approver_count,
        settings.enabled AS provider_enabled,
        settings.emergency_stop,
        settings.last_synced_at,
        settings.last_error,
        latest_export.status AS export_status,
        latest_export.successful_additions,
        latest_export.successful_removals,
        latest_export.completed_at AS export_completed_at,
        latest_export.error_message AS export_error
      FROM crm_persona_audience_activation_requests request
      LEFT JOIN (
        SELECT request_id, COUNT(DISTINCT approved_by) AS approver_count
        FROM crm_persona_audience_activation_approvals
        GROUP BY request_id
      ) approval ON approval.request_id = request.id
      LEFT JOIN crm_persona_audience_provider_settings settings
        ON settings.client_id = request.client_id
       AND settings.provider = request.provider
      LEFT JOIN LATERAL (
        SELECT status, successful_additions, successful_removals, completed_at, error_message
        FROM crm_persona_audience_exports
        WHERE request_id = request.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest_export ON true
      WHERE request.client_id = $1
      ORDER BY request.updated_at DESC
    `, [clientId])
  ])

  const identity = identityRows[0] || {}
  const consent = consentRows[0] || {}
  const signals = signalRows[0] || {}
  const totalProfiles = numberValue(identity.total_profiles)
  const recordedConsent = numberValue(consent.recorded_profiles)
  const linkedProfiles = numberValue(identity.linked_profiles)
  const matchableProfiles = numberValue(identity.matchable_profiles)
  const exportEligible = numberValue(consent.export_eligible)

  const providerMap = new Map(connectionRows.map(row => [String(row.provider), row]))
  const authorizationMap = new Map(authorizationRows.map(row => [String(row.provider), row]))
  const providers = ['google_ads', 'meta'].map(provider => {
    const connection = providerMap.get(provider) || {}
    const authorization = authorizationMap.get(provider) || {}
    const connected = numberValue(connection.active_connections) > 0
    const credentialReady = provider === 'google_ads'
      ? connected && Boolean(connection.data_manager_ready)
      : connected

    return {
      provider,
      connected,
      credentialReady,
      activeConnections: numberValue(connection.active_connections),
      lastConnectedAt: connection.last_connected_at || null,
      authorization: authorization.status || 'pending',
      policyVersion: authorization.policy_version || null,
      authorizedByName: authorization.authorized_by_name || null,
      acceptedAt: authorization.accepted_at || null,
      withdrawnAt: authorization.withdrawn_at || null,
      privacyNoticeUrl: authorization.privacy_notice_url || null,
      ready: credentialReady && authorization.status === 'accepted' && exportEligible > 0
    }
  })

  const warnings: Array<{ code: string, message: string }> = []
  if (totalProfiles > 0 && recordedConsent === 0) {
    warnings.push({
      code: 'consent_not_recorded',
      message: 'No person-level marketing consent has been recorded. Provider audience additions remain blocked.'
    })
  }
  if (totalProfiles > 0 && linkedProfiles / totalProfiles < 0.5) {
    warnings.push({
      code: 'identity_linkage_low',
      message: 'Fewer than half of tracked profiles are linked to a known CRM or lead identity.'
    })
  }
  if (!providerMap.has('google_ads')) {
    warnings.push({ code: 'google_not_connected', message: 'No client-mapped Google Ads connection is available.' })
  } else if (!providerMap.get('google_ads')?.data_manager_ready) {
    warnings.push({
      code: 'google_scope_missing',
      message: 'Google Ads must be reconnected with the Data Manager scope before Customer Match sync.'
    })
  }
  if (!providerMap.has('meta')) {
    warnings.push({ code: 'meta_not_connected', message: 'No client-mapped Meta connection is available.' })
  }

  setHeader(event, 'Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
  return {
    generatedAt: new Date().toISOString(),
    client: {
      id: client.clientId,
      name: client.clientName,
      canAuthorize: client.isPrimaryContact || client.permissions.canApproveWork
    },
    accuracy: {
      totalProfiles,
      linkedProfiles,
      matchableProfiles,
      consentRecordedProfiles: recordedConsent,
      marketingGranted: numberValue(consent.granted),
      marketingDenied: numberValue(consent.denied),
      marketingUnknown: numberValue(consent.unknown),
      exportEligible,
      totalSignals: numberValue(signals.total_signals),
      recentSignals: numberValue(signals.recent_signals),
      signalledProfiles: numberValue(signals.signalled_profiles),
      productSignals: numberValue(signals.product_signals),
      identityLinkageRate: totalProfiles ? linkedProfiles / totalProfiles : 0,
      matchabilityRate: totalProfiles ? matchableProfiles / totalProfiles : 0,
      consentCoverageRate: totalProfiles ? recordedConsent / totalProfiles : 0,
      exportEligibilityRate: totalProfiles ? exportEligible / totalProfiles : 0,
      lastProfileSeenAt: identity.last_profile_seen_at || null,
      lastConsentAt: consent.last_consent_at || null,
      lastSignalAt: signals.last_signal_at || null
    },
    sourceMix: sourceRows.map(row => ({
      source: row.source_type,
      count: numberValue(row.count),
      lastSeenAt: row.last_seen_at
    })),
    personas: personaRows.map(row => ({
      id: row.id,
      key: row.persona_key,
      version: row.version,
      label: row.label,
      description: row.description,
      minConfidence: Number(row.min_confidence || 0),
      allowedChannels: row.allowed_channels || [],
      targetingAllowed: Boolean(row.targeting_allowed),
      reportingAllowed: Boolean(row.reporting_allowed),
      updatedAt: row.updated_at
    })),
    providers,
    activations: activationRows.map(row => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      status: row.status,
      estimatedSize: numberValue(row.estimated_size),
      minimumSize: numberValue(row.minimum_size),
      blockedReason: row.blocked_reason,
      approverCount: numberValue(row.approver_count),
      providerEnabled: Boolean(row.provider_enabled),
      emergencyStop: Boolean(row.emergency_stop),
      lastSyncedAt: row.last_synced_at,
      lastError: row.last_error,
      exportStatus: row.export_status,
      successfulAdditions: numberValue(row.successful_additions),
      successfulRemovals: numberValue(row.successful_removals),
      exportCompletedAt: row.export_completed_at,
      exportError: row.export_error,
      updatedAt: row.updated_at
    })),
    warnings
  }
})
