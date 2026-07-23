import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const PodiumMessageEventSchema = z.object({
  data: z.object({
    uid: z.string().trim().max(255).nullish(),
    body: z.string().max(20_000).nullish(),
    createdAt: z.string().datetime({ offset: true }).nullish(),
    webchatUrl: z.string().trim().url().max(2048)
      .refine(value => ['http:', 'https:'].includes(new URL(value).protocol), {
        message: 'webchatUrl must use HTTP or HTTPS'
      })
      .nullish(),
    contactName: z.string().trim().max(500).nullish(),
    contact: z.object({
      uid: z.string().trim().max(255).nullish(),
      name: z.string().trim().max(500).nullish(),
      externalIdentifier: z.string().trim().max(500).nullish()
    }).nullish(),
    conversation: z.object({
      uid: z.string().trim().max(255).nullish(),
      channel: z.object({
        type: z.string().trim().max(100).nullish(),
        identifier: z.string().trim().max(500).nullish()
      }).nullish()
    }).nullish(),
    location: z.object({
      uid: z.string().trim().max(255).nullish(),
      organizationUid: z.string().trim().max(255).nullish()
    }).nullish()
  }).passthrough(),
  metadata: z.object({
    eventType: z.string().trim().min(1).max(100),
    eventUid: z.string().trim().min(1).max(255).nullish(),
    version: z.string().trim().max(100).nullish()
  }).passthrough()
}).passthrough()

export interface VerifyPodiumWebhookSignatureInput {
  rawBody: string
  timestamp: string | null | undefined
  signature: string | null | undefined
  secret: string
  nowMs?: number
  toleranceMs?: number
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Podium signs `${timestamp}.${rawBody}` with HMAC-SHA256. Keep verification
 * against the untouched request bytes and reject old timestamps to limit replay.
 */
export function verifyPodiumWebhookSignature(
  input: VerifyPodiumWebhookSignatureInput
): boolean {
  const timestamp = input.timestamp?.trim()
  const submitted = input.signature?.trim().replace(/^sha256=/i, '')
  if (!timestamp || !submitted || !input.secret) return false

  const timestampMs = Number(timestamp)
  if (!Number.isSafeInteger(timestampMs)) return false
  const nowMs = input.nowMs ?? Date.now()
  const toleranceMs = input.toleranceMs ?? 5 * 60_000
  if (Math.abs(nowMs - timestampMs) > toleranceMs) return false

  const digest = createHmac('sha256', input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest()
  const normalized = submitted.toLowerCase()
  return safeEqual(normalized, digest.toString('hex'))
    || safeEqual(submitted, digest.toString('base64'))
}

function assign(
  fields: Record<string, string>,
  key: string,
  value: string | null | undefined,
  max = 4096
): void {
  const candidate = value?.trim()
  if (candidate) fields[key] = candidate.slice(0, max)
}

function nameFields(fields: Record<string, string>, fullName: string | null): void {
  if (!fullName) return
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  assign(fields, 'full_name', fullName, 500)
  assign(fields, 'first_name', parts[0], 200)
  if (parts.length > 1) assign(fields, 'last_name', parts.slice(1).join(' '), 300)
}

const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'ttclid',
  'msclkid',
  'li_fat_id'
] as const

function attributionFromUrl(value: string): Record<string, string> | null {
  const url = new URL(value)
  const attribution: Record<string, string> = {}
  for (const key of ATTRIBUTION_KEYS) {
    const candidate = url.searchParams.get(key)?.trim()
    if (candidate) attribution[key] = candidate.slice(0, 512)
  }
  return Object.keys(attribution).length ? attribution : null
}

export interface NormalizedPodiumLead {
  sourceLeadId: string
  formId: string
  formName: string
  submittedAt: string
  webchatUrl: string
  fieldData: Record<string, string>
  attribution: Record<string, string> | null
}

export type NormalizePodiumWebhookResult
  = { status: 'accepted', lead: NormalizedPodiumLead }
    | { status: 'ignored', reason: 'event_type' | 'not_webchat' }
    | { status: 'invalid', reason: 'payload' | 'event_id' }

export function normalizePodiumWebhookEvent(
  rawEvent: unknown
): NormalizePodiumWebhookResult {
  const parsed = PodiumMessageEventSchema.safeParse(rawEvent)
  if (!parsed.success) return { status: 'invalid', reason: 'payload' }

  const event = parsed.data
  if (event.metadata.eventType !== 'message.received') {
    return { status: 'ignored', reason: 'event_type' }
  }
  if (!event.data.webchatUrl) {
    return { status: 'ignored', reason: 'not_webchat' }
  }

  const eventId = event.metadata.eventUid || event.data.uid
  if (!eventId) return { status: 'invalid', reason: 'event_id' }

  const fields: Record<string, string> = { lead_provider: 'podium' }
  const fullName = event.data.contactName ?? event.data.contact?.name ?? null
  nameFields(fields, fullName)

  const channel = event.data.conversation?.channel
  const identifier = channel?.identifier?.trim()
  if (identifier && identifier.includes('@')) {
    assign(fields, 'email', identifier.toLowerCase(), 320)
  } else if (identifier && /\d{6}/.test(identifier.replace(/\D/g, ''))) {
    assign(fields, 'phone_number', identifier, 64)
  }

  assign(fields, 'podium_contact_uid', event.data.contact?.uid, 255)
  assign(fields, 'podium_conversation_uid', event.data.conversation?.uid, 255)
  assign(fields, 'podium_message_uid', event.data.uid, 255)
  assign(fields, 'podium_location_uid', event.data.location?.uid, 255)
  assign(fields, 'podium_organization_uid', event.data.location?.organizationUid, 255)
  assign(fields, 'podium_channel_type', channel?.type, 100)
  assign(fields, 'podium_webchat_url', event.data.webchatUrl, 2048)
  assign(fields, 'message', event.data.body, 4096)

  return {
    status: 'accepted',
    lead: {
      sourceLeadId: `podium:${eventId}`,
      formId: 'podium-webchat',
      formName: 'Podium Webchat',
      submittedAt: event.data.createdAt ?? new Date().toISOString(),
      webchatUrl: event.data.webchatUrl,
      fieldData: fields,
      attribution: attributionFromUrl(event.data.webchatUrl)
    }
  }
}
