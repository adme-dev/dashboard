import type { LeadTransactionClient } from '~~/server/utils/leads/db'
import { fingerprintLeadIdentity } from '~~/server/utils/leads/submissionIntent'

export interface PossibleDuplicateSignal {
  possibleDuplicateOfLeadId: string
  matchBasis: 'email_hmac' | 'phone_hmac' | 'email_phone_hmac'
  confidence: number
  windowHours: number
}

function valueFor(fields: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key]?.trim()
    if (value) return value
  }
  return null
}

/**
 * This is deliberately advisory: the canonical lead has already been accepted
 * when this query runs. It only consumes tenant-scoped HMAC keys, never raw
 * contact values, and a failure must not change the accepted lead outcome.
 */
export async function findEmailLeadDuplicateSignal(
  db: LeadTransactionClient,
  input: { clientId: string, leadId: string, fieldData: Record<string, string>, occurredAt: string }
): Promise<PossibleDuplicateSignal | null> {
  const identity = fingerprintLeadIdentity({
    email: valueFor(input.fieldData, ['email', 'email_address', 'work_email']),
    phone: valueFor(input.fieldData, ['phone', 'phone_number', 'mobile', 'mobile_number', 'telephone'])
  })
  if (!identity.emailFingerprint && !identity.phoneFingerprint) return null

  const result = await db.query(`
    WITH matching_profiles AS (
      SELECT DISTINCT profile_id
      FROM crm_identity_keys
      WHERE client_id = $1
        AND ((identity_type = 'email' AND identity_hash = $3)
          OR (identity_type = 'phone' AND identity_hash = $4))
    )
    SELECT candidate.lead_id, candidate_lead.client_id AS candidate_client_id,
      CASE
        WHEN $3::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM crm_identity_keys ek
          WHERE ek.client_id = $1 AND ek.profile_id = candidate.profile_id
            AND ek.identity_type = 'email' AND ek.identity_hash = $3
        ) AND $4::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM crm_identity_keys pk
          WHERE pk.client_id = $1 AND pk.profile_id = candidate.profile_id
            AND pk.identity_type = 'phone' AND pk.identity_hash = $4
        ) THEN 'email_phone_hmac'
        WHEN $3::text IS NOT NULL AND EXISTS (
          SELECT 1 FROM crm_identity_keys ek
          WHERE ek.client_id = $1 AND ek.profile_id = candidate.profile_id
            AND ek.identity_type = 'email' AND ek.identity_hash = $3
        ) THEN 'email_hmac'
        ELSE 'phone_hmac'
      END AS match_method
    FROM crm_lead_identity_links candidate
    JOIN leads candidate_lead ON candidate_lead.id = candidate.lead_id
    WHERE candidate.client_id = $1
      AND candidate_lead.client_id = $1
      AND candidate.lead_id <> $2
      AND (SELECT COUNT(*) FROM matching_profiles) = 1
      AND candidate_lead.deleted_at IS NULL
      AND candidate_lead.submitted_at >= $5::timestamptz - INTERVAL '168 hours'
      AND candidate_lead.submitted_at <= $5::timestamptz + INTERVAL '168 hours'
      AND EXISTS (
        SELECT 1 FROM crm_identity_keys key
        WHERE key.client_id = $1 AND key.profile_id = candidate.profile_id
          AND ((key.identity_type = 'email' AND key.identity_hash = $3)
            OR (key.identity_type = 'phone' AND key.identity_hash = $4))
      )
    ORDER BY candidate_lead.submitted_at DESC, candidate.lead_id ASC
    LIMIT 1
  `, [input.clientId, input.leadId, identity.emailFingerprint, identity.phoneFingerprint, input.occurredAt])
  const row = result.rows?.[0] as {
    lead_id?: string
    candidate_client_id?: string
    match_method?: PossibleDuplicateSignal['matchBasis']
  } | undefined
  if (!row?.lead_id || row.candidate_client_id !== input.clientId || !row.match_method) return null
  return {
    possibleDuplicateOfLeadId: row.lead_id,
    matchBasis: row.match_method,
    confidence: row.match_method === 'email_phone_hmac' ? 0.98 : 0.9,
    windowHours: 168
  }
}
