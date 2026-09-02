import { queryOne } from '~~/server/utils/db'
import {
  derivePageStudioReleaseMetadata,
  type PageStudioReleaseMetadata
} from '~~/server/utils/pageStudio/releaseMetadata'

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

interface ApprovedCheckpointRow {
  version_id: string
  version_digest: string
  checkpoint_id: string
  checkpoint_digest: string
  object_key: string
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

export async function loadApprovedPageStudioReleaseCheckpoint(input: {
  scope: PageStudioReleaseScope
  versionId: string
  bucket: PageStudioCheckpointBucket
}): Promise<{
  checkpointId: string
  digest: string
  manifest: unknown
  releaseMetadata: PageStudioReleaseMetadata
}> {
  const row = await queryOne<ApprovedCheckpointRow>(`
    SELECT
      version.id AS version_id,
      version.digest AS version_digest,
      version.checkpoint_id,
      checkpoint.digest AS checkpoint_digest,
      checkpoint.object_key
    FROM page_studio_versions AS version
    INNER JOIN page_studio_checkpoints AS checkpoint
      ON checkpoint.tenant_id = version.tenant_id
     AND checkpoint.client_id = version.client_id
     AND checkpoint.site_id = version.site_id
     AND checkpoint.id = version.checkpoint_id
    WHERE version.tenant_id = $1
      AND version.client_id = $2
      AND version.site_id = $3
      AND version.id = $4
      AND EXISTS (
        SELECT 1
        FROM page_studio_reviews AS review
        WHERE review.tenant_id = version.tenant_id
          AND review.client_id = version.client_id
          AND review.site_id = version.site_id
          AND review.version_id = version.id
          AND review.version_digest = version.digest
          AND review.decision = 'approved'
      )
    LIMIT 1
  `, [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.versionId])

  if (!row) {
    throw new PageStudioReleaseCheckpointError('VERSION_NOT_APPROVED', 'The requested version does not have an approved immutable checkpoint', 409)
  }

  const expectedKey = `tenants/${input.scope.tenantId}/clients/${input.scope.clientId}/sites/${input.scope.siteId}/checkpoints/${row.checkpoint_id}.json`
  if (row.object_key !== expectedKey) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_KEY_MISMATCH', 'The checkpoint object key is outside the canonical site scope')
  }

  const object = await input.bucket.get(expectedKey)
  if (!object) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_NOT_FOUND', 'The approved checkpoint object is missing')
  }
  if (typeof object.size === 'number' && object.size > MAX_CHECKPOINT_BYTES) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_TOO_LARGE', 'The approved checkpoint exceeds the 8 MB limit')
  }

  const text = await new Response(object.body).text()
  if (text.length > MAX_CHECKPOINT_BYTES) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_TOO_LARGE', 'The approved checkpoint exceeds the 8 MB limit')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_INVALID', 'The approved checkpoint is not valid JSON')
  }

  const envelope = parseEnvelope(parsed)
  if (envelope.checkpointId !== row.checkpoint_id || !sameScope(envelope.scope, input.scope)) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_SCOPE_MISMATCH', 'The approved checkpoint does not belong to the requested site')
  }

  const manifest = envelope.manifest as { id?: unknown }
  if (!manifest || typeof manifest !== 'object' || manifest.id !== input.scope.siteId) {
    throw new PageStudioReleaseCheckpointError('MANIFEST_SITE_MISMATCH', 'The checkpoint manifest does not belong to the requested site')
  }

  const digest = await sha256(canonicalJson(envelope.manifest))
  const expectedDigests = [envelope.digest, row.checkpoint_digest, row.version_digest]
  if (expectedDigests.some(expected => expected !== digest)) {
    throw new PageStudioReleaseCheckpointError('CHECKPOINT_DIGEST_MISMATCH', 'The checkpoint digest does not match its approved version')
  }

  return {
    checkpointId: row.checkpoint_id,
    digest,
    manifest: envelope.manifest,
    releaseMetadata: derivePageStudioReleaseMetadata(envelope.manifest)
  }
}

export async function attachPageStudioReleaseMetadataToBuild(input: {
  scope: PageStudioReleaseScope
  versionId: string
  buildId: string
  digest: string
  releaseMetadata: PageStudioReleaseMetadata
}) {
  const build = await queryOne<{ id: string }>(`
    UPDATE page_studio_builds
    SET release_metadata = $7::jsonb
    WHERE tenant_id = $1
      AND client_id = $2
      AND site_id = $3
      AND version_id = $4
      AND id = $5
      AND version_digest = $6
      AND state = 'succeeded'
    RETURNING id
  `, [
    input.scope.tenantId,
    input.scope.clientId,
    input.scope.siteId,
    input.versionId,
    input.buildId,
    input.digest,
    JSON.stringify(input.releaseMetadata)
  ])

  if (!build) {
    throw new PageStudioReleaseCheckpointError(
      'BUILD_METADATA_REJECTED',
      'Release metadata could not be attached to the succeeded approved build',
      409
    )
  }

  return build
}
