import type { ParsedInboundAttachment } from './contracts'

const DEFAULT_RETENTION_DAYS = 30
const MAX_RETENTION_DAYS = 30
const MAX_ATTACHMENTS = 10
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface R2PutOptionsLike {
  httpMetadata: {
    contentType: string
    cacheControl: string
  }
  customMetadata: Record<string, string>
  sha256: ArrayBuffer
}

export interface CrmEmailR2Bucket {
  put(
    key: string,
    value: ArrayBuffer,
    options: R2PutOptionsLike
  ): Promise<unknown>
  delete(keys: string[]): Promise<void>
}

export interface CrmInboundArtifactAttachment {
  r2ObjectKey: string
  filename: string
  contentType: string
  byteSize: number
  sha256: string
  contentId: string | null
}

export interface CrmInboundArtifactManifest {
  rawMimeR2Key: string
  rawMimeSha256: string
  rawMimeExpiresAt: string
  attachments: CrmInboundArtifactAttachment[]
}

interface StoreCrmInboundEmailArtifactsInput {
  bucket: CrmEmailR2Bucket
  raw: ArrayBuffer
  attachments: ParsedInboundAttachment[]
  retentionDays: number
}

interface R2ArtifactDependencies {
  now?: () => Date
  randomUUID?: () => string
}

interface Digest {
  bytes: ArrayBuffer
  hex: string
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function stripControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
}

async function sha256(value: ArrayBuffer): Promise<Digest> {
  const bytes = await crypto.subtle.digest('SHA-256', value)
  return {
    bytes,
    hex: bytesToHex(new Uint8Array(bytes))
  }
}

function sanitizeFilename(value: string | null, index: number): string {
  const candidate = value?.split(/[/\\]/).pop() ?? ''
  const basename = stripControlCharacters(candidate).trim()
  return (basename || `attachment-${index}`).slice(0, 500)
}

function sanitizeContentType(value: string): string {
  const contentType = value.trim().toLowerCase()
  return (
    contentType.length <= 255
    && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(
      contentType
    )
  )
    ? contentType
    : 'application/octet-stream'
}

function sanitizeContentId(value: string | null | undefined): string | null {
  if (!value) return null
  const sanitized = stripControlCharacters(value).trim()
  return sanitized ? sanitized.slice(0, 998) : null
}

function datePath(value: Date): string {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0')
  ].join('/')
}

function normalizedRetentionDays(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    return DEFAULT_RETENTION_DAYS
  }
  return Math.min(value, MAX_RETENTION_DAYS)
}

export function resolveCrmEmailRetentionDays(value?: string): number {
  if (!value || !/^\d+$/.test(value)) return DEFAULT_RETENTION_DAYS
  return normalizedRetentionDays(Number(value))
}

export async function deleteCrmInboundEmailArtifacts(
  bucket: CrmEmailR2Bucket,
  manifest: CrmInboundArtifactManifest
): Promise<void> {
  await bucket.delete([
    manifest.rawMimeR2Key,
    ...manifest.attachments.map(attachment => attachment.r2ObjectKey)
  ])
}

export async function storeCrmInboundEmailArtifacts(
  input: StoreCrmInboundEmailArtifactsInput,
  dependencies: R2ArtifactDependencies = {}
): Promise<CrmInboundArtifactManifest> {
  if (input.attachments.length > MAX_ATTACHMENTS) {
    throw new Error('Too many attachments for CRM email storage')
  }

  for (const attachment of input.attachments) {
    if (
      !(attachment.content instanceof ArrayBuffer)
      || attachment.content.byteLength !== attachment.size
    ) {
      throw new Error('Attachment content is unavailable')
    }
  }

  const now = dependencies.now?.() ?? new Date()
  if (!Number.isFinite(now.getTime())) {
    throw new Error('Invalid CRM email storage timestamp')
  }
  const messageId = dependencies.randomUUID?.() ?? crypto.randomUUID()
  if (!UUID_PATTERN.test(messageId)) {
    throw new Error('Invalid CRM email storage identifier')
  }

  const retentionDays = normalizedRetentionDays(input.retentionDays)
  const expiresAt = new Date(
    now.getTime() + retentionDays * 24 * 60 * 60 * 1000
  ).toISOString()
  const prefix = `crm-email/inbound/${datePath(now)}/${messageId}`
  const rawMimeR2Key = `${prefix}/message.eml`
  const writtenKeys: string[] = []

  try {
    const rawDigest = await sha256(input.raw)
    await input.bucket.put(rawMimeR2Key, input.raw, {
      httpMetadata: {
        contentType: 'message/rfc822',
        cacheControl: 'private, no-store'
      },
      customMetadata: {
        kind: 'raw_mime',
        retentionExpiresAt: expiresAt,
        scanStatus: 'pending'
      },
      sha256: rawDigest.bytes
    })
    writtenKeys.push(rawMimeR2Key)

    const attachments: CrmInboundArtifactAttachment[] = []
    for (const [offset, attachment] of input.attachments.entries()) {
      const index = offset + 1
      const r2ObjectKey
        = `${prefix}/attachments/${String(index).padStart(2, '0')}.bin`
      const content = attachment.content!
      const digest = await sha256(content)
      const contentType = sanitizeContentType(attachment.mimeType)

      await input.bucket.put(r2ObjectKey, content, {
        httpMetadata: {
          contentType,
          cacheControl: 'private, no-store'
        },
        customMetadata: {
          kind: 'attachment',
          attachmentIndex: String(index),
          retentionExpiresAt: expiresAt,
          scanStatus: 'pending'
        },
        sha256: digest.bytes
      })
      writtenKeys.push(r2ObjectKey)
      attachments.push({
        r2ObjectKey,
        filename: sanitizeFilename(attachment.filename, index),
        contentType,
        byteSize: content.byteLength,
        sha256: digest.hex,
        contentId: sanitizeContentId(attachment.contentId)
      })
    }

    return {
      rawMimeR2Key,
      rawMimeSha256: rawDigest.hex,
      rawMimeExpiresAt: expiresAt,
      attachments
    }
  } catch (error) {
    if (writtenKeys.length > 0) {
      try {
        await input.bucket.delete(writtenKeys)
      } catch {
        // Preserve the original storage failure for retry; lifecycle cleanup
        // remains the last-resort guard for an R2 delete outage.
      }
    }
    throw error
  }
}
