import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  CanonicalEventNameSchema,
  MeasurementEnquiryTypeSchema
} from '~~/server/utils/measurement/contracts'

const ConsentDecisionSchema = z.enum(['granted', 'denied', 'not_required'])
const EvidenceStageSchema = z.enum([
  'captured', 'consent_decision', 'destination_configured',
  'delivery_attempted', 'provider_accepted', 'provider_reporting_observed'
])
const EvidenceOutcomeSchema = z.enum([
  'observed', 'attempted', 'skipped', 'delivered', 'failed', 'accepted', 'reported'
])

export const DealerMeasurementEvidenceV1Schema = z.strictObject({
  version: z.literal('dealer.measurement.evidence.v1'),
  clientId: z.string().uuid(),
  siteId: z.string().trim().min(1).max(255),
  eventId: z.string().trim().min(1).max(255),
  browserTransactionId: z.string().trim().min(1).max(255).optional(),
  event: z.strictObject({
    name: CanonicalEventNameSchema,
    enquiryType: MeasurementEnquiryTypeSchema.optional(),
    value: z.number().finite().nonnegative().max(1_000_000_000).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional()
  }).refine(value => (value.value === undefined) === (value.currency === undefined), {
    message: 'Value and currency must be supplied together'
  }).refine(value => value.name === 'web_conversion' || value.enquiryType === undefined, {
    message: 'Enquiry type is only valid for web conversions'
  }),
  occurredAt: z.string().datetime({ offset: true }),
  consent: z.strictObject({
    analytics: ConsentDecisionSchema,
    advertising: ConsentDecisionSchema
  }),
  evidence: z.array(z.strictObject({
    stage: EvidenceStageSchema,
    outcome: EvidenceOutcomeSchema,
    destination: z.enum(['google_ads', 'ga4', 'meta_ads', 'linkedin_ads', 'tiktok_ads', 'other']).optional(),
    channel: z.enum(['browser', 'server', 'provider']).optional(),
    providerActionResourceName: z.string()
      .regex(/^customers\/\d{1,20}\/conversionActions\/\d{1,20}$/)
      .optional(),
    providerEventId: z.string().trim().min(1).max(255).optional(),
    diagnosticCode: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional()
  })).min(1).max(32),
  call: z.strictObject({
    id: z.string().trim().min(1).max(255),
    status: z.enum(['initiated', 'connected', 'not_connected', 'completed', 'failed']),
    durationSeconds: z.number().int().nonnegative().max(86_400).optional(),
    qualificationThresholdSeconds: z.number().int().nonnegative().max(86_400).optional(),
    qualified: z.boolean().optional(),
    campaignResourceName: z.string().regex(/^customers\/\d{1,20}\/campaigns\/\d{1,20}$/).optional(),
    adResourceName: z.string().regex(/^customers\/\d{1,20}\/ads\/\d{1,20}$/).optional()
  }).optional()
})

export type DealerMeasurementEvidenceV1 = z.infer<typeof DealerMeasurementEvidenceV1Schema>

export interface DealerEvidenceEndpoint {
  id: string
  clientId: string
  profileId: string
  endpointKey: string
  sourceSystem: string
  status: 'disabled' | 'test' | 'live' | 'paused'
  replayWindowSeconds: number
  rateLimitPerMinute: number
  trackingSiteId: string | null
  currentSecret: string
  previousSecret: string | null
  previousSecretValidUntil: Date | null
  allowServerDelivery: boolean
  browserServerDedupValidated: boolean
}

export type PersistDealerEvidenceResult = { status: 'created' | 'duplicate' | 'replay' }

export interface PersistDealerEvidenceInput {
  endpoint: DealerEvidenceEndpoint
  payload: DealerMeasurementEvidenceV1
  nonce: string
  nonceExpiresAt: Date
  receivedAt: Date
}

export class DealerEvidenceError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number) {
    super(code)
    this.name = 'DealerEvidenceError'
  }
}

interface DealerEvidenceServiceDependencies {
  resolveEndpoint(endpointKey: string): Promise<DealerEvidenceEndpoint | null>
  consumeRateLimit(endpoint: DealerEvidenceEndpoint): Promise<boolean>
  persist(input: PersistDealerEvidenceInput): Promise<PersistDealerEvidenceResult>
  now?: () => Date
}

export interface DealerEvidenceRequest {
  endpointKey: string
  rawBody: string
  headers: { timestamp?: string, nonce?: string, signature?: string }
}

function signatureMatches(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false
  const left = Buffer.from(actual.toLowerCase(), 'hex')
  const right = Buffer.from(expected, 'hex')
  return left.length === right.length && timingSafeEqual(left, right)
}

function verifySignature(
  request: DealerEvidenceRequest,
  endpoint: DealerEvidenceEndpoint,
  now: Date
): void {
  const { timestamp, nonce, signature } = request.headers
  if (!timestamp || !nonce || !signature || !/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{8,128}$/.test(nonce)) {
    throw new DealerEvidenceError('invalid_signature', 401)
  }
  const timestampMs = Number(timestamp) * 1000
  if (Math.abs(now.getTime() - timestampMs) > endpoint.replayWindowSeconds * 1000) {
    throw new DealerEvidenceError('timestamp_outside_window', 401)
  }
  const signed = `v1.${timestamp}.${nonce}.${request.endpointKey}.${request.rawBody}`
  const candidates = [endpoint.currentSecret]
  if (endpoint.previousSecret && endpoint.previousSecretValidUntil && endpoint.previousSecretValidUntil >= now) {
    candidates.push(endpoint.previousSecret)
  }
  const valid = candidates.some(secret => signatureMatches(
    signature,
    createHmac('sha256', secret).update(signed).digest('hex')
  ))
  if (!valid) throw new DealerEvidenceError('invalid_signature', 401)
}

function validatePolicy(payload: DealerMeasurementEvidenceV1, endpoint: DealerEvidenceEndpoint): void {
  if (payload.clientId !== endpoint.clientId || payload.siteId !== endpoint.trackingSiteId) {
    throw new DealerEvidenceError('binding_mismatch', 403)
  }
  const advertisingDelivery = payload.evidence.some(item =>
    item.destination === 'google_ads'
    && item.stage === 'delivery_attempted'
    && !['skipped', 'failed'].includes(item.outcome)
  )
  if (payload.consent.advertising === 'denied' && advertisingDelivery) {
    throw new DealerEvidenceError('consent_violation', 422)
  }
  const serverDelivery = payload.evidence.some(item =>
    item.destination === 'google_ads' && item.channel === 'server'
  )
  if (serverDelivery && (!endpoint.allowServerDelivery
    || !endpoint.browserServerDedupValidated
    || !payload.browserTransactionId)) {
    throw new DealerEvidenceError('server_delivery_not_approved', 422)
  }
}

export function createDealerEvidenceService(dependencies: DealerEvidenceServiceDependencies) {
  return {
    async ingest(request: DealerEvidenceRequest) {
      const now = (dependencies.now ?? (() => new Date()))()
      const endpoint = await dependencies.resolveEndpoint(request.endpointKey)
      if (!endpoint || !['test', 'live'].includes(endpoint.status) || endpoint.sourceSystem !== 'dealer_platform') {
        throw new DealerEvidenceError('endpoint_unavailable', 404)
      }
      verifySignature(request, endpoint, now)
      if (!await dependencies.consumeRateLimit(endpoint)) {
        throw new DealerEvidenceError('rate_limited', 429)
      }
      let parsedBody: unknown
      try {
        parsedBody = JSON.parse(request.rawBody)
      } catch {
        throw new DealerEvidenceError('invalid_payload', 400)
      }
      const result = DealerMeasurementEvidenceV1Schema.safeParse(parsedBody)
      if (!result.success) throw new DealerEvidenceError('invalid_payload', 400)
      validatePolicy(result.data, endpoint)
      const persisted = await dependencies.persist({
        endpoint,
        payload: result.data,
        nonce: request.headers.nonce!,
        nonceExpiresAt: new Date(now.getTime() + endpoint.replayWindowSeconds * 1000),
        receivedAt: now
      })
      if (persisted.status === 'replay') throw new DealerEvidenceError('replay_detected', 409)
      return {
        status: 'accepted' as const,
        eventId: result.data.eventId,
        duplicate: persisted.status === 'duplicate'
      }
    }
  }
}

export function hashDealerEvidenceNonce(nonce: string): string {
  return createHash('sha256').update(nonce).digest('hex')
}
