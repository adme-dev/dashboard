import { createHmac, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import type { LeadTransactionClient } from '~~/server/utils/leads/db'
import { normalizeEmailForDest, normalizePhoneE164 } from '~~/server/utils/tracking/normalize'
import type { TrackingSite } from '~~/server/utils/tracking/site-config'

const IdentitySchema = z.strictObject({
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().min(5).max(64).optional()
}).refine(value => Boolean(value.email || value.phone), 'identity_required')

const AttributionSchema = z.record(
  z.string().trim().min(1).max(128),
  z.string().max(512)
).refine(value => Object.keys(value).length <= 80, 'too_many_attribution_fields')

export const SubmissionIntentSchema = z.strictObject({
  browser_event_id: z.string().trim().min(1).max(128),
  occurred_at: z.number().int().positive(),
  form_id: z.string().trim().max(255).nullable().optional(),
  page_url: z.string().trim().url().max(2048),
  vehicle_reference: z.string().trim().max(128).nullable().optional(),
  identity: IdentitySchema,
  attribution: AttributionSchema.default({}),
  consent: z.string().max(4096).nullable().optional()
})

export type SubmissionIntentPayload = z.infer<typeof SubmissionIntentSchema>

interface IntentCandidate {
  id: string
  browser_event_id: string
  email_fingerprint: string | null
  phone_fingerprint: string | null
  form_id: string | null
  vehicle_reference: string | null
  attribution: Record<string, string> | string | null
  occurred_at: string
}

export interface IntentReservation {
  intentId: string
  reservationToken: string
  browserEventId: string
  attribution: Record<string, string>
  confidence: number
}

function fingerprintKey(): string {
  const master = process.env.LEAD_IDENTITY_HMAC_KEY || process.env.CRON_SECRET
  if (!master) throw new Error('LEAD_IDENTITY_HMAC_KEY is not configured')
  return createHmac('sha256', master)
    .update('zeroflow:lead-submission-identity:v1')
    .digest('hex')
}

function fingerprint(kind: 'email' | 'phone', value: string): string {
  return createHmac('sha256', fingerprintKey())
    .update(`${kind}:${value}`)
    .digest('hex')
}

export function fingerprintLeadIdentity(input: {
  email?: string | null
  phone?: string | null
}): { emailFingerprint: string | null, phoneFingerprint: string | null } {
  const email = input.email
    ? normalizeEmailForDest(input.email, 'meta')
    : ''
  const phone = input.phone
    ? normalizePhoneE164(input.phone)
    : ''
  return {
    emailFingerprint: email ? fingerprint('email', email) : null,
    phoneFingerprint: phone ? fingerprint('phone', phone) : null
  }
}

function safeAttribution(value: IntentCandidate['attribution']): Record<string, string> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return value
}

export async function storeSubmissionIntent(input: {
  site: Pick<TrackingSite, 'id' | 'clientId'>
  payload: SubmissionIntentPayload
}): Promise<boolean> {
  const identity = fingerprintLeadIdentity(input.payload.identity)
  if (!identity.emailFingerprint && !identity.phoneFingerprint) return false

  const row = await queryOne<{ id: string }>(
    `INSERT INTO lead_submission_intents (
       client_id, site_id, browser_event_id,
       email_fingerprint, phone_fingerprint,
       form_id, page_url, vehicle_reference, attribution, occurred_at, expires_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb,
       TO_TIMESTAMP($10::double precision / 1000.0),
       TO_TIMESTAMP($10::double precision / 1000.0) + INTERVAL '7 days'
     )
     ON CONFLICT (site_id, browser_event_id) DO NOTHING
     RETURNING id`,
    [
      input.site.clientId,
      input.site.id,
      input.payload.browser_event_id,
      identity.emailFingerprint,
      identity.phoneFingerprint,
      input.payload.form_id ?? null,
      input.payload.page_url,
      input.payload.vehicle_reference ?? null,
      JSON.stringify(input.payload.attribution),
      input.payload.occurred_at
    ]
  )
  return Boolean(row)
}

function fieldValue(fields: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = fields[alias]?.trim()
    if (value) return value
  }
  return null
}

function parseTime(value: string): number {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : Date.now()
}

export function scoreIntentCandidate(input: {
  candidate: Pick<IntentCandidate,
    'email_fingerprint' | 'phone_fingerprint' | 'form_id' |
    'vehicle_reference' | 'occurred_at'>
  emailFingerprint: string | null
  phoneFingerprint: string | null
  formId: string | null
  vehicleReference: string | null
  submittedAt: string
}): number {
  const emailMatch = Boolean(
    input.emailFingerprint
    && input.candidate.email_fingerprint === input.emailFingerprint
  )
  const phoneMatch = Boolean(
    input.phoneFingerprint
    && input.candidate.phone_fingerprint === input.phoneFingerprint
  )
  if (!emailMatch && !phoneMatch) return 0

  let score = emailMatch && phoneMatch ? 100 : 80
  if (input.formId && input.candidate.form_id === input.formId) score += 10
  if (
    input.vehicleReference
    && input.candidate.vehicle_reference
    && input.candidate.vehicle_reference.toLowerCase() === input.vehicleReference.toLowerCase()
  ) score += 15

  const distanceMinutes = Math.abs(
    parseTime(input.submittedAt) - parseTime(input.candidate.occurred_at)
  ) / 60_000
  if (distanceMinutes <= 5) score += 10
  else if (distanceMinutes <= 30) score += 5
  return score
}

export function chooseIntentCandidate(
  candidates: IntentCandidate[],
  context: {
    emailFingerprint: string | null
    phoneFingerprint: string | null
    formId: string | null
    vehicleReference: string | null
    submittedAt: string
  }
): { candidate: IntentCandidate, confidence: number } | null {
  const ranked = candidates
    .map(candidate => ({
      candidate,
      confidence: scoreIntentCandidate({ candidate, ...context })
    }))
    .filter(item => item.confidence >= 80)
    .sort((a, b) => b.confidence - a.confidence)

  const top = ranked[0]
  if (!top) return null
  const runnerUp = ranked[1]
  if (!runnerUp) return top
  if (top.confidence < 95 || top.confidence - runnerUp.confidence < 15) return null
  return top
}

export async function reserveSubmissionIntentForLead(input: {
  clientId: string
  fieldData: Record<string, string>
  submittedAt: string
  formId: string | null
}): Promise<IntentReservation | null> {
  const email = fieldValue(input.fieldData, ['email', 'email_address', 'work_email'])
  const phone = fieldValue(input.fieldData, [
    'phone_number', 'phone', 'mobile', 'mobile_number', 'telephone', 'work_phone'
  ])
  const identity = fingerprintLeadIdentity({ email, phone })
  if (!identity.emailFingerprint && !identity.phoneFingerprint) return null

  const vehicleReference = fieldValue(input.fieldData, [
    'vehicle_stock_number', 'stock_number', 'vehicle_vin', 'vin', 'vehicle_id'
  ])
  const candidates = await queryRows<IntentCandidate>(
    `SELECT id, browser_event_id, email_fingerprint, phone_fingerprint,
            form_id, vehicle_reference, attribution, occurred_at
       FROM lead_submission_intents
      WHERE client_id = $1
        AND matched_lead_id IS NULL
        AND expires_at > NOW()
        AND (
          match_status = 'pending'
          OR (match_status = 'reserved' AND reserved_until < NOW())
        )
        AND occurred_at BETWEEN $4::timestamptz - INTERVAL '6 hours'
                            AND $4::timestamptz + INTERVAL '1 hour'
        AND (
          ($2::text IS NOT NULL AND email_fingerprint = $2)
          OR ($3::text IS NOT NULL AND phone_fingerprint = $3)
        )
      ORDER BY ABS(EXTRACT(EPOCH FROM (occurred_at - $4::timestamptz)))
      LIMIT 10`,
    [
      input.clientId,
      identity.emailFingerprint,
      identity.phoneFingerprint,
      input.submittedAt
    ]
  )

  const selected = chooseIntentCandidate(candidates, {
    ...identity,
    formId: input.formId,
    vehicleReference,
    submittedAt: input.submittedAt
  })
  if (!selected) return null

  const reservationToken = randomUUID()
  const reserved = await queryOne<IntentCandidate>(
    `UPDATE lead_submission_intents
        SET match_status = 'reserved',
            reservation_token = $2,
            reserved_until = NOW() + INTERVAL '2 minutes',
            match_confidence = $3,
            updated_at = NOW()
      WHERE id = $1
        AND matched_lead_id IS NULL
        AND expires_at > NOW()
        AND (
          match_status = 'pending'
          OR (match_status = 'reserved' AND reserved_until < NOW())
        )
      RETURNING id, browser_event_id, email_fingerprint, phone_fingerprint,
                form_id, vehicle_reference, attribution, occurred_at`,
    [selected.candidate.id, reservationToken, selected.confidence]
  )
  if (!reserved) return null

  return {
    intentId: reserved.id,
    reservationToken,
    browserEventId: reserved.browser_event_id,
    attribution: safeAttribution(reserved.attribution),
    confidence: selected.confidence
  }
}

export async function releaseSubmissionIntentReservation(
  reservation: Pick<IntentReservation, 'intentId' | 'reservationToken'>
): Promise<void> {
  await queryOne(
    `UPDATE lead_submission_intents
        SET match_status = 'pending',
            reservation_token = NULL,
            reserved_until = NULL,
            updated_at = NOW()
      WHERE id = $1
        AND reservation_token = $2
        AND matched_lead_id IS NULL
      RETURNING id`,
    [reservation.intentId, reservation.reservationToken]
  )
}

export async function completeSubmissionIntentMatch(
  db: LeadTransactionClient,
  input: {
    intentId: string
    reservationToken: string
    leadId: string
  }
): Promise<void> {
  const result = await db.query(
    `UPDATE lead_submission_intents
        SET match_status = 'matched',
            matched_lead_id = $3,
            matched_at = NOW(),
            reservation_token = NULL,
            reserved_until = NULL,
            updated_at = NOW()
      WHERE id = $1
        AND reservation_token = $2
        AND reserved_until > NOW()
        AND matched_lead_id IS NULL
      RETURNING id`,
    [input.intentId, input.reservationToken, input.leadId]
  )
  if (!result.rows?.length) {
    throw new Error('Lead submission intent reservation expired before commit')
  }
}
