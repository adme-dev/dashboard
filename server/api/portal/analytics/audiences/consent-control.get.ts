import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne, queryRows } from '~~/server/utils/db'

type ConsentSummaryRow = {
  recorded_profiles: string
  granted_profiles: string
  denied_profiles: string
  unknown_profiles: string
}

type SuppressionSummaryRow = {
  active_suppressions: string
  google_suppressions: string
  meta_suppressions: string
  all_provider_suppressions: string
}

const numberValue = (value: unknown) => Number(value || 0)

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const clientId = client.clientId
  const [consentSummary, suppressionSummary, decisions, suppressions] = await Promise.all([
    queryOne<ConsentSummaryRow>(
      `WITH latest AS (
         SELECT DISTINCT ON (subject_hash)
           subject_hash,
           marketing
         FROM crm_consent_history
         WHERE client_id = $1
         ORDER BY subject_hash, occurred_at DESC, created_at DESC, id DESC
       )
       SELECT
         COUNT(*)::text AS recorded_profiles,
         COUNT(*) FILTER (WHERE marketing = 'granted')::text AS granted_profiles,
         COUNT(*) FILTER (WHERE marketing = 'denied')::text AS denied_profiles,
         COUNT(*) FILTER (WHERE marketing = 'unknown')::text AS unknown_profiles
       FROM latest`,
      [clientId],
    ),
    queryOne<SuppressionSummaryRow>(
      `SELECT
         COUNT(*)::text AS active_suppressions,
         COUNT(*) FILTER (WHERE destination = 'google_ads')::text AS google_suppressions,
         COUNT(*) FILTER (WHERE destination = 'meta')::text AS meta_suppressions,
         COUNT(*) FILTER (WHERE destination = 'all')::text AS all_provider_suppressions
       FROM crm_persona_current_suppressions
       WHERE client_id = $1
         AND purpose IN ('marketing', 'all')
         AND channel IN ('ads', 'all')`,
      [clientId],
    ),
    queryRows<{
      profile_id: string | null
      subject_reference: string
      marketing: 'granted' | 'denied' | 'unknown'
      analytics: 'granted' | 'denied' | 'unknown'
      tracking: 'granted' | 'denied' | 'unknown'
      consent_source: string
      policy_version: string
      notice_url: string | null
      decision_method: string
      occurred_at: string
    }>(
      `WITH ranked AS (
         SELECT
           profile_id,
           RIGHT(subject_hash, 12) AS subject_reference,
           marketing,
           analytics,
           tracking,
           consent_source,
           policy_version,
           notice_url,
           decision_method,
           occurred_at,
           ROW_NUMBER() OVER (
             PARTITION BY subject_hash
             ORDER BY occurred_at DESC, created_at DESC, id DESC
           ) AS decision_rank
         FROM crm_consent_history
         WHERE client_id = $1
       )
       SELECT
         profile_id,
         subject_reference,
         marketing,
         analytics,
         tracking,
         consent_source,
         policy_version,
         notice_url,
         decision_method,
         occurred_at
       FROM ranked
       WHERE decision_rank = 1
       ORDER BY occurred_at DESC
       LIMIT 25`,
      [clientId],
    ),
    queryRows<{
      id: string
      profile_id: string | null
      subject_reference: string | null
      purpose: string
      channel: string
      destination: string
      reason_code: string
      source_type: string
      actor_type: string
      occurred_at: string
    }>(
      `SELECT
         id,
         profile_id,
         CASE WHEN subject_hash IS NULL THEN NULL ELSE RIGHT(subject_hash, 12) END AS subject_reference,
         purpose,
         channel,
         destination,
         reason_code,
         source_type,
         actor_type,
         occurred_at
       FROM crm_persona_current_suppressions
       WHERE client_id = $1
         AND purpose IN ('marketing', 'all')
         AND channel IN ('ads', 'all')
       ORDER BY occurred_at DESC
       LIMIT 50`,
      [clientId],
    ),
  ])

  setHeader(event, 'Cache-Control', 'private, no-store')

  return {
    generatedAt: new Date().toISOString(),
    canManage: client.isPrimaryContact || client.permissions.canApproveWork,
    summary: {
      recordedProfiles: numberValue(consentSummary?.recorded_profiles),
      grantedProfiles: numberValue(consentSummary?.granted_profiles),
      deniedProfiles: numberValue(consentSummary?.denied_profiles),
      unknownProfiles: numberValue(consentSummary?.unknown_profiles),
      activeSuppressions: numberValue(suppressionSummary?.active_suppressions),
      googleSuppressions: numberValue(suppressionSummary?.google_suppressions),
      metaSuppressions: numberValue(suppressionSummary?.meta_suppressions),
      allProviderSuppressions: numberValue(suppressionSummary?.all_provider_suppressions),
    },
    decisions: decisions.map(row => ({
      profileId: row.profile_id,
      subjectReference: row.subject_reference,
      marketing: row.marketing,
      analytics: row.analytics,
      tracking: row.tracking,
      consentSource: row.consent_source,
      policyVersion: row.policy_version,
      noticeUrl: row.notice_url,
      decisionMethod: row.decision_method,
      occurredAt: row.occurred_at,
    })),
    suppressions: suppressions.map(row => ({
      id: row.id,
      profileId: row.profile_id,
      subjectReference: row.subject_reference,
      purpose: row.purpose,
      channel: row.channel,
      destination: row.destination,
      reasonCode: row.reason_code,
      sourceType: row.source_type,
      actorType: row.actor_type,
      occurredAt: row.occurred_at,
    })),
  }
})

