import type { LeadTransactionClient } from '~~/server/utils/leads/db'
import { fingerprintLeadIdentityKey } from '~~/server/utils/leads/submissionIntent'
import { isPersonaIdentityEnabled } from '~~/server/utils/persona/feature'

type IdentityType = 'browser' | 'provider'

export interface RecordLeadPersonaInput {
  clientId: string
  leadId: string
  source: string
  providerLeadId: string
  fieldData: Record<string, string>
  attribution: Record<string, string> | null
  consentDecision: unknown
  occurredAt: string
}

export type RecordLeadPersonaResult
  = { status: 'disabled' | 'insufficient_identity' }
    | { status: 'linked', profileId: string }
    | { status: 'identity_conflict', profileIds: string[] }

function optionalText(value: unknown, max = 2048): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null
}

function fieldValue(fields: Record<string, string>, keys: string[]): string | null {
  return keys.map(key => optionalText(fields[key], 512)).find(Boolean) ?? null
}

function attributionMetadata(
  attribution: Record<string, string> | null,
  fieldData: Record<string, string>
): Record<string, string> {
  const metadata: Record<string, string> = {}
  const keys = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'campaignId', 'campaign_id', 'adGroupId', 'ad_group_id', 'adSetId',
    'ad_set_id', 'adId', 'ad_id', 'creativeId', 'creative_id',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'landingPage', 'landing_page',
    'referrer'
  ]
  for (const key of keys) {
    const value = optionalText(attribution?.[key], 2048)
      ?? optionalText(fieldData[key], 2048)
    if (value) metadata[key] = value
  }
  const pageUrl = fieldValue(fieldData, ['page_url', 'product_url', 'vehicle_url'])
  if (pageUrl && !metadata.landingPage && !metadata.landing_page) {
    metadata.landingPage = pageUrl
  }
  return metadata
}

async function insertEvidence(
  db: LeadTransactionClient,
  input: {
    clientId: string
    profileId: string
    evidenceType: 'confirmed_lead' | 'browser_submission' | 'provider_lead' | 'campaign_attribution' | 'identity_conflict'
    source: string
    sourceId: string
    confidence: number
    metadata: Record<string, unknown>
    occurredAt: string
  }
): Promise<void> {
  await db.query(
    `INSERT INTO crm_identity_evidence (
       client_id, profile_id, evidence_type, source, source_id,
       confidence, metadata, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
     ON CONFLICT (client_id, profile_id, evidence_type, source, source_id)
     DO NOTHING`,
    [
      input.clientId,
      input.profileId,
      input.evidenceType,
      input.source,
      input.sourceId,
      input.confidence,
      JSON.stringify(input.metadata),
      input.occurredAt
    ]
  )
}

export async function recordLeadPersonaEvidence(
  db: LeadTransactionClient,
  input: RecordLeadPersonaInput
): Promise<RecordLeadPersonaResult> {
  if (!await isPersonaIdentityEnabled(input.clientId, db)) {
    return { status: 'disabled' }
  }

  const browserEventId = optionalText(input.attribution?.browserEventId, 128)
  const providerLeadId = optionalText(input.providerLeadId, 512)
  const keys: Array<{
    type: IdentityType
    hash: string
    subjectType: 'browser_submission' | 'provider_lead'
  }> = []
  if (browserEventId) {
    keys.push({
      type: 'browser',
      hash: fingerprintLeadIdentityKey('browser', browserEventId),
      subjectType: 'browser_submission'
    })
  }
  if (providerLeadId) {
    keys.push({
      type: 'provider',
      hash: fingerprintLeadIdentityKey('provider', `${input.source}:${providerLeadId}`),
      subjectType: 'provider_lead'
    })
  }

  const existingLeadLink = await db.query(
    `SELECT profile_id
       FROM crm_lead_identity_links
      WHERE client_id = $1 AND lead_id = $2
      LIMIT 1
      FOR UPDATE`,
    [input.clientId, input.leadId]
  )
  let profileId = (existingLeadLink.rows?.[0] as { profile_id: string } | undefined)?.profile_id ?? null

  const matchingProfiles = keys.length
    ? await db.query(
        `SELECT profile_id
           FROM crm_identity_keys
          WHERE client_id = $1
            AND identity_type = ANY($2::text[])
            AND identity_hash = ANY($3::text[])
          FOR UPDATE`,
        [
          input.clientId,
          keys.map(key => key.type),
          keys.map(key => key.hash)
        ]
      )
    : { rows: [] }
  const matchedProfileIds = [...new Set(
    (matchingProfiles.rows ?? []).map(row => (row as { profile_id: string }).profile_id)
  )]
  const resolvedProfileIds = [...new Set([
    ...(profileId ? [profileId] : []),
    ...matchedProfileIds
  ])]

  if (resolvedProfileIds.length > 1) {
    if (profileId) {
      await insertEvidence(db, {
        clientId: input.clientId,
        profileId,
        evidenceType: 'identity_conflict',
        source: input.source,
        sourceId: input.leadId,
        confidence: 0,
        metadata: { conflictingProfileIds: resolvedProfileIds },
        occurredAt: input.occurredAt
      })
    }
    return { status: 'identity_conflict', profileIds: resolvedProfileIds }
  }

  profileId = resolvedProfileIds[0] ?? null
  if (!profileId) {
    if (!keys.length) return { status: 'insufficient_identity' }
    const inserted = await db.query(
      `INSERT INTO crm_identity_profiles (client_id, first_seen_at, last_seen_at)
       VALUES ($1, $2::timestamptz, $2::timestamptz)
       RETURNING id`,
      [input.clientId, input.occurredAt]
    )
    profileId = (inserted.rows?.[0] as { id: string }).id
  }

  await db.query(
    `INSERT INTO crm_lead_identity_links (
       client_id, lead_id, profile_id, match_method, confidence, linked_at
     ) VALUES ($1, $2, $3, $4, 100, $5::timestamptz)
     ON CONFLICT (lead_id) DO NOTHING`,
    [
      input.clientId,
      input.leadId,
      profileId,
      existingLeadLink.rows?.length ? 'deterministic_identity' : keys[0]?.type ?? 'deterministic_identity',
      input.occurredAt
    ]
  )

  for (const key of keys) {
    await db.query(
      `INSERT INTO crm_identity_keys (
         client_id, profile_id, identity_type, identity_hash, first_seen_at, last_seen_at
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)
       ON CONFLICT (client_id, identity_type, identity_hash)
       DO UPDATE SET last_seen_at = GREATEST(crm_identity_keys.last_seen_at, EXCLUDED.last_seen_at)
       WHERE crm_identity_keys.profile_id = EXCLUDED.profile_id`,
      [input.clientId, profileId, key.type, key.hash, input.occurredAt]
    )
    await db.query(
      `INSERT INTO crm_identity_subject_links (
         client_id, profile_id, subject_type, subject_id, metadata,
         first_seen_at, last_seen_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
       ON CONFLICT (client_id, subject_type, subject_id)
       DO UPDATE SET last_seen_at = GREATEST(
                       crm_identity_subject_links.last_seen_at,
                       EXCLUDED.last_seen_at
                     ),
                     updated_at = NOW()
       WHERE crm_identity_subject_links.profile_id = EXCLUDED.profile_id`,
      [
        input.clientId,
        profileId,
        key.subjectType,
        key.hash,
        JSON.stringify({ source: input.source }),
        input.occurredAt
      ]
    )
  }

  await db.query(
    `INSERT INTO crm_identity_subject_links (
       client_id, profile_id, subject_type, subject_id, metadata,
       first_seen_at, last_seen_at
     ) VALUES ($1, $2, 'lead', $3, $4::jsonb, $5::timestamptz, $5::timestamptz)
     ON CONFLICT (client_id, subject_type, subject_id)
     DO UPDATE SET last_seen_at = GREATEST(
                     crm_identity_subject_links.last_seen_at,
                     EXCLUDED.last_seen_at
                   ),
                   updated_at = NOW()
     WHERE crm_identity_subject_links.profile_id = EXCLUDED.profile_id`,
    [
      input.clientId,
      profileId,
      input.leadId,
      JSON.stringify({
        source: input.source,
        provider: fieldValue(input.fieldData, ['lead_provider']) ?? input.source
      }),
      input.occurredAt
    ]
  )

  await db.query(
    `UPDATE crm_identity_profiles
        SET first_seen_at = LEAST(first_seen_at, $3::timestamptz),
            last_seen_at = GREATEST(last_seen_at, $3::timestamptz),
            updated_at = NOW()
      WHERE client_id = $1 AND id = $2`,
    [input.clientId, profileId, input.occurredAt]
  )

  await insertEvidence(db, {
    clientId: input.clientId,
    profileId,
    evidenceType: 'confirmed_lead',
    source: input.source,
    sourceId: input.leadId,
    confidence: 100,
    metadata: {
      provider: fieldValue(input.fieldData, ['lead_provider']) ?? input.source,
      consentDecision: input.consentDecision
    },
    occurredAt: input.occurredAt
  })
  if (browserEventId) {
    await insertEvidence(db, {
      clientId: input.clientId,
      profileId,
      evidenceType: 'browser_submission',
      source: 'zeroflow_tracking',
      sourceId: input.leadId,
      confidence: 100,
      metadata: {
        landingPage: fieldValue(input.fieldData, ['page_url', 'product_url', 'vehicle_url'])
      },
      occurredAt: input.occurredAt
    })
  }
  if (providerLeadId) {
    await insertEvidence(db, {
      clientId: input.clientId,
      profileId,
      evidenceType: 'provider_lead',
      source: input.source,
      sourceId: input.leadId,
      confidence: 100,
      metadata: {
        provider: fieldValue(input.fieldData, ['lead_provider']) ?? input.source
      },
      occurredAt: input.occurredAt
    })
  }
  const attribution = attributionMetadata(input.attribution, input.fieldData)
  if (Object.keys(attribution).length) {
    await insertEvidence(db, {
      clientId: input.clientId,
      profileId,
      evidenceType: 'campaign_attribution',
      source: input.source,
      sourceId: input.leadId,
      confidence: 100,
      metadata: attribution,
      occurredAt: input.occurredAt
    })
  }

  return { status: 'linked', profileId }
}
