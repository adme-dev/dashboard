import { createHmac, timingSafeEqual } from 'node:crypto'

export const STANDARD_WEBHOOK_TOLERANCE_SECONDS = 5 * 60

export type StandardWebhookVerification =
  | { ok: true, webhookId: string, timestamp: number }
  | { ok: false, reason: 'missing_headers' | 'invalid_timestamp' | 'expired' | 'invalid_signature' }

function secretBytes(secret: string): Buffer | null {
  if (!secret.startsWith('whsec_')) return null
  try {
    const bytes = Buffer.from(secret.slice(6), 'base64url')
    return bytes.length >= 16 ? bytes : null
  } catch {
    return null
  }
}

function suppliedSignatures(header: string): Buffer[] {
  const signatures: Buffer[] = []
  for (const value of header.trim().split(/\s+/)) {
    const comma = value.indexOf(',')
    if (comma < 0 || value.slice(0, comma) !== 'v1') continue
    const encoded = value.slice(comma + 1)
    if (!encoded) continue
    try {
      const decoded = Buffer.from(encoded, 'base64')
      if (decoded.length) signatures.push(decoded)
    } catch {
      // Invalid candidate signatures are ignored without short-circuiting.
    }
  }
  return signatures
}

export function verifyStandardWebhook(input: {
  rawBody: string
  webhookId?: string | null
  webhookTimestamp?: string | null
  webhookSignature?: string | null
  secrets: string[]
  nowSeconds?: number
}): StandardWebhookVerification {
  const webhookId = input.webhookId?.trim()
  const timestampValue = input.webhookTimestamp?.trim()
  const signatureValue = input.webhookSignature?.trim()
  if (!webhookId || webhookId.length > 255 || !timestampValue || !signatureValue) {
    return { ok: false, reason: 'missing_headers' }
  }
  if (!/^\d{10}$/.test(timestampValue)) return { ok: false, reason: 'invalid_timestamp' }
  const timestamp = Number(timestampValue)
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(timestamp)) return { ok: false, reason: 'invalid_timestamp' }
  if (Math.abs(now - timestamp) > STANDARD_WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'expired' }
  }

  const supplied = suppliedSignatures(signatureValue)
  const signed = `${webhookId}.${timestampValue}.${input.rawBody}`
  let matched = false
  for (const secret of input.secrets) {
    const key = secretBytes(secret)
    if (!key) continue
    const expected = createHmac('sha256', key).update(signed).digest()
    for (const candidate of supplied) {
      const equal = candidate.length === expected.length
        && timingSafeEqual(candidate, expected)
      matched = equal || matched
    }
  }
  return matched
    ? { ok: true, webhookId, timestamp }
    : { ok: false, reason: 'invalid_signature' }
}

export function signStandardWebhook(input: {
  rawBody: string
  webhookId: string
  timestamp: number
  secret: string
}): string {
  const key = secretBytes(input.secret)
  if (!key) throw new Error('invalid_standard_webhook_secret')
  const signed = `${input.webhookId}.${input.timestamp}.${input.rawBody}`
  return `v1,${createHmac('sha256', key).update(signed).digest('base64')}`
}
