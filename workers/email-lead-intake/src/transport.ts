import { parseMimeContent } from '../../../shared/leads/email/mime'
import type { NormalizedInboundEmail } from '../../../shared/leads/email/types'

const RECIPIENT_TOKEN = /-([0123456789abcdefghjkmnpqrstvwxyz]{10})$/

export interface CloudflareEmailMetadata {
  readonly to: string
  readonly from: string
  readonly rawSize: number
}

export interface CloudflareEmailMessage extends CloudflareEmailMetadata {
  readonly headers: Headers
  readonly raw: ReadableStream<Uint8Array>
  setReject(reason: string): void
}

function normalizeMailbox(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

export function extractRecipientToken(address: string): string | null {
  const trimmed = address.trim()
  const separator = trimmed.lastIndexOf('@')
  if (separator <= 0 || separator === trimmed.length - 1) return null
  const localPart = trimmed.slice(0, separator)
  if (localPart.length > 64) return null
  return localPart.match(RECIPIENT_TOKEN)?.[1] ?? null
}

export function mailboxDomain(value: string | null): string | null {
  if (!value) return null
  const normalized = normalizeMailbox(value)
  if (!normalized) return null
  const separator = normalized.lastIndexOf('@')
  if (separator <= 0 || separator === normalized.length - 1) return null
  const domain = normalized.slice(separator + 1)
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)
    ? domain
    : null
}

export async function readBoundedRawEmail(
  stream: ReadableStream<Uint8Array>,
  declaredSize: number,
  maxBytes: number
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > maxBytes) {
    throw new Error('Raw email declared size exceeds limit')
  }
  const reader = stream.getReader()
  const output = new Uint8Array(declaredSize)
  let offset = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw new Error('Raw email stream yielded invalid bytes')
      if (offset + value.byteLength > maxBytes || offset + value.byteLength > declaredSize) {
        await reader.cancel('Raw email stream exceeds limit')
        throw new Error('Raw email stream exceeds byte limit')
      }
      output.set(value, offset)
      offset += value.byteLength
    }
  }
  finally {
    reader.releaseLock()
  }
  if (offset !== declaredSize) throw new Error('Raw email size mismatch')
  return output
}

export async function normalizeCloudflareEmail(
  message: CloudflareEmailMetadata,
  raw: Uint8Array,
  receivedAt: string
): Promise<NormalizedInboundEmail> {
  if (raw.byteLength !== message.rawSize) throw new Error('Raw email size mismatch')
  const parsed = await parseMimeContent(raw)
  return {
    transport: 'cloudflare_email_routing',
    envelopeRecipient: normalizeMailbox(message.to) ?? '',
    envelopeSender: normalizeMailbox(message.from),
    headerFrom: normalizeMailbox(parsed.headerFrom ?? ''),
    subject: parsed.subject,
    text: parsed.text || null,
    html: parsed.html || null,
    messageId: parsed.messageId,
    attachments: parsed.attachments,
    receivedAt,
    rawSize: parsed.rawSize
  }
}
