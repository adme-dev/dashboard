const MAX_CHECKPOINT_BYTES = 8 * 1024 * 1024

interface CheckpointObject {
  body: ReadableStream
  size?: number
}

export interface PageStudioCheckpointBucket {
  get(key: string): Promise<CheckpointObject | null>
}

export interface PageStudioReleaseScope {
  tenantId: string
  clientId: string
  siteId: string
}

interface CheckpointEnvelope {
  schemaVersion: number
  checkpointId: string
  digest: string
  manifest: unknown
  scope: {
    tenantId: string
    clientId: string
    siteId: string
  }
}

export class PageStudioReleaseCheckpointError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 422
  ) {
    super(message)
    this.name = 'PageStudioReleaseCheckpointError'
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function parseEnvelope(value: unknown): CheckpointEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_INVALID', 'Checkpoint envelope must be an object')
  }
  const envelope = value as Partial<CheckpointEnvelope>
  if (envelope.schemaVersion !== 1 || typeof envelope.checkpointId !== 'string' || typeof envelope.digest !== 'string') {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_INVALID', 'Checkpoint envelope fields are invalid')
  }
  if (!envelope.scope || typeof envelope.scope !== 'object' || !envelope.manifest) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_INVALID', 'Checkpoint scope or manifest is missing')
  }
  return envelope as CheckpointEnvelope
}

function sameScope(left: PageStudioReleaseScope, right: PageStudioReleaseScope) {
  return left.tenantId === right.tenantId && left.clientId === right.clientId && left.siteId === right.siteId
}

/** Read an immutable checkpoint only after its pointer has been authorised by the caller. */
export async function loadPageStudioCheckpoint(input: {
  scope: PageStudioReleaseScope
  bucket: PageStudioCheckpointBucket
  checkpointId: string
  objectKey: string
  digests: string[]
}): Promise<{ checkpointId: string, digest: string, manifest: unknown }> {
  const expectedKey = `tenants/${input.scope.tenantId}/clients/${input.scope.clientId}/sites/${input.scope.siteId}/checkpoints/${input.checkpointId}.json`
  if (input.objectKey !== expectedKey) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_KEY_MISMATCH', 'The checkpoint object key is outside the canonical site scope')
  }
  const object = await input.bucket.get(expectedKey)
  if (!object) throw new PageStudioReleaseCheckpointError('CHECKPOINT_NOT_FOUND', 'The saved checkpoint object is missing')
  if (typeof object.size === 'number' && object.size > MAX_CHECKPOINT_BYTES) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_TOO_LARGE', 'The checkpoint exceeds the 8 MB limit')
  }

  // Bound the actual streamed bytes as well as R2 metadata.
  const reader = object.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > MAX_CHECKPOINT_BYTES) {
        await reader.cancel()
        throw new PageStudioReleaseCheckpointError('CHECKPOINT_TOO_LARGE', 'The checkpoint exceeds the 8 MB limit')
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_INVALID', 'The checkpoint is not valid JSON')
  }
  const envelope = parseEnvelope(parsed)
  if (envelope.checkpointId !== input.checkpointId || !sameScope(envelope.scope, input.scope)) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_SCOPE_MISMATCH', 'The checkpoint does not belong to the requested site')
  }
  const manifest = envelope.manifest as { id?: unknown }
  if (!manifest || typeof manifest !== 'object' || manifest.id !== input.scope.siteId) {
    throw new PageStudioReleaseCheckpointError('MANIFEST_SITE_MISMATCH', 'The checkpoint manifest does not belong to the requested site')
  }
  const digest = await sha256(canonicalJson(envelope.manifest))
  if (!input.digests.length || [envelope.digest, ...input.digests].some(expected => expected !== digest)) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_DIGEST_MISMATCH', 'The checkpoint digest does not match its saved pointer')
  }
  return { checkpointId: input.checkpointId, digest, manifest: envelope.manifest }
}
