import type { LeadTransactionClient } from '~~/server/utils/leads/db'
import { fingerprintLeadIdentity } from '~~/server/utils/leads/submissionIntent'

export type LeadIdentityLinkResult
  = { status: 'linked', profileId: string, confidence: number }
    | { status: 'insufficient_identity' }
    | { status: 'identity_conflict', profileIds: string[] }

function fieldValue(fields: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = fields[alias]?.trim()
    if (value) return value
  }
  return null
}

function rows<T>(result: { rows?: unknown[] }): T[] {
  return (result.rows ?? []) as T[]
}

export async function linkLeadIdentity(
  db: LeadTransactionClient,
  input: {
    clientId: string
    leadId: string
    fieldData: Record<string, string>
    occurredAt: string
  }
): Promise<LeadIdentityLinkResult> {
  const identity = fingerprintLeadIdentity({
    email: fieldValue(input.fieldData, ['email', 'email_address', 'work_email']),
    phone: fieldValue(input.fieldData, ['phone_number', 'phone', 'mobile', 'mobile_number', 'telephone'])
  })
  const keys = [
    identity.emailFingerprint && { type: 'email', hash: identity.emailFingerprint },
    identity.phoneFingerprint && { type: 'phone', hash: identity.phoneFingerprint }
  ].filter((key): key is { type: string, hash: string } => Boolean(key))
  if (!keys.length) return { status: 'insufficient_identity' }

  const existing = [...new Set(rows<{ profile_id: string }>(await db.query(
    `SELECT profile_id
       FROM crm_identity_keys
      WHERE client_id = $1
        AND ((identity_type = 'email' AND identity_hash = $2)
          OR (identity_type = 'phone' AND identity_hash = $3))
      FOR UPDATE`,
    [input.clientId, identity.emailFingerprint, identity.phoneFingerprint]
  )).map(row => row.profile_id))]

  if (existing.length > 1) {
    return { status: 'identity_conflict', profileIds: existing }
  }

  let profileId = existing[0]
  if (!profileId) {
    const created = rows<{ id: string }>(await db.query(
      `INSERT INTO crm_identity_profiles (client_id, first_seen_at, last_seen_at)
       VALUES ($1, $2::timestamptz, $2::timestamptz)
       RETURNING id`,
      [input.clientId, input.occurredAt]
    ))[0]
    if (!created) throw new Error('Failed to create CRM identity profile')
    profileId = created.id
  } else {
    await db.query(
      `UPDATE crm_identity_profiles
          SET last_seen_at = GREATEST(last_seen_at, $3::timestamptz), updated_at = NOW()
        WHERE client_id = $1 AND id = $2`,
      [input.clientId, profileId, input.occurredAt]
    )
  }

  for (const key of keys) {
    await db.query(
      `INSERT INTO crm_identity_keys (client_id, profile_id, identity_type, identity_hash, last_seen_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)
       ON CONFLICT (client_id, identity_type, identity_hash) DO UPDATE
         SET last_seen_at = GREATEST(crm_identity_keys.last_seen_at, EXCLUDED.last_seen_at)`,
      [input.clientId, profileId, key.type, key.hash, input.occurredAt]
    )
  }

  const resolved = rows<{ profile_id: string }>(await db.query(
    `SELECT DISTINCT profile_id
       FROM crm_identity_keys
      WHERE client_id = $1
        AND ((identity_type = 'email' AND identity_hash = $2)
          OR (identity_type = 'phone' AND identity_hash = $3))`,
    [input.clientId, identity.emailFingerprint, identity.phoneFingerprint]
  )).map(row => row.profile_id)
  if (resolved.length !== 1) {
    return { status: 'identity_conflict', profileIds: resolved }
  }
  profileId = resolved[0]

  await db.query(
    `INSERT INTO crm_lead_identity_links (lead_id, client_id, profile_id, match_method, confidence)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (lead_id) DO NOTHING`,
    [input.leadId, input.clientId, profileId, keys.length === 2 ? 'email_phone_hmac' : `${keys[0].type}_hmac`, keys.length === 2 ? 100 : 90]
  )

  return { status: 'linked', profileId, confidence: keys.length === 2 ? 100 : 90 }
}
