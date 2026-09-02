import { queryOne, transaction } from '~~/server/utils/db'

export interface PageStudioControlScope {
  tenantId: string
  clientId: string
  siteId: string
}

export interface PageStudioControlQueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type RunTransaction = <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>

export class PageStudioControlError extends Error {
  constructor(
    readonly code:
      | 'AUDIT_EVENT_CONFLICT'
      | 'BASE_DIGEST_MISMATCH'
      | 'CHECKPOINT_CONFLICT'
      | 'CHECKPOINT_DIGEST_MISMATCH'
      | 'CHECKPOINT_NOT_FOUND'
      | 'CHECKPOINT_SCOPE_INVALID'
      | 'CONTROL_SCOPE_NOT_FOUND'
      | 'VERSION_CONFLICT'
      | 'VERSION_NOT_CURRENT'
      | 'VERSION_NOT_FOUND'
      | 'VERSION_STATE_INVALID',
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PageStudioControlError'
  }
}

export interface PageStudioCheckpointInput {
  checkpointId: string
  createdAt: string
  digest: string
  etag: string
  objectKey: string
  scope: PageStudioControlScope
  userId: string
}

export interface PageStudioVersionRegistrationInput {
  authorRole: 'agency' | 'client'
  checkpointId: string
  digest: string
  idempotencyKey: string
  scope: PageStudioControlScope
  summary: string
  userId: string
}

export interface PageStudioAiProposalAcceptanceInput {
  authorRole: 'agency' | 'client'
  baseDigest: string
  checkpoint: PageStudioCheckpointInput
  idempotencyKey: string
  summary: string
}

export type PageStudioAuditAction
  = | 'workspace.created'
    | 'workspace.reconnected'
    | 'workspace.checkpointed'
    | 'workspace.previewed'
    | 'workspace.terminated'
    | 'session.revoked'
    | 'version.registered'
    | 'version.submitted'

export type PageStudioAuditResourceType = 'checkpoint' | 'session' | 'version' | 'workspace'

export interface PageStudioAuditEventInput {
  action: PageStudioAuditAction
  actorId: string
  actorRole: 'agency' | 'client' | 'service'
  idempotencyKey: string
  occurredAt: string
  resourceId: string
  resourceType: PageStudioAuditResourceType
  scope: PageStudioControlScope
}

interface CheckpointRow {
  id: string
  tenant_id: string
  client_id: string
  site_id: string
  digest: string
  object_key: string
  etag: string
  author_id: string | null
  created_at: string | Date
}

interface VersionRow {
  id: string
  checkpoint_id: string
  digest: string
  author_id: string
  author_role: 'agency' | 'client'
  summary: string
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'published'
  created_at: string | Date
}

interface AuditRow {
  action: string
  actor_id: string
  actor_role: string
  occurred_at: string | Date
  resource_id: string
  resource_type: string
}

const defaultRunTransaction: RunTransaction = callback =>
  transaction(async db => callback(db as unknown as PageStudioControlQueryClient))

function expectedCheckpointObjectKey(scope: PageStudioControlScope, checkpointId: string): string {
  return `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpointId}.json`
}

function timestamp(value: string | Date): string {
  return new Date(value).toISOString()
}

async function requireScopedSite(
  db: PageStudioControlQueryClient,
  scope: PageStudioControlScope,
  lock: 'FOR SHARE' | 'FOR UPDATE'
): Promise<void> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM page_studio_sites
     WHERE tenant_id = $1 AND client_id = $2 AND id = $3
     ${lock}`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )
  if (!result.rows[0]) {
    throw new PageStudioControlError(
      'CONTROL_SCOPE_NOT_FOUND',
      404,
      'Page Studio site scope not found'
    )
  }
}

async function appendMutationAudit(
  db: PageStudioControlQueryClient,
  input: {
    scope: PageStudioControlScope
    actorId: string
    actorRole: 'agency' | 'client' | 'service'
    action: PageStudioAuditAction
    resourceType: PageStudioAuditResourceType
    resourceId: string
    idempotencyKey: string
    metadata: Record<string, string>
  }
): Promise<void> {
  await db.query(
    `INSERT INTO page_studio_audit_events (
       tenant_id, client_id, site_id, actor_id, actor_role, action,
       resource_type, resource_id, idempotency_key, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      input.scope.tenantId,
      input.scope.clientId,
      input.scope.siteId,
      input.actorId,
      input.actorRole,
      input.action,
      input.resourceType,
      input.resourceId,
      input.idempotencyKey,
      JSON.stringify(input.metadata)
    ]
  )
}

function checkpointMatches(row: CheckpointRow, input: PageStudioCheckpointInput): boolean {
  return row.id === input.checkpointId
    && row.tenant_id === input.scope.tenantId
    && row.client_id === input.scope.clientId
    && row.site_id === input.scope.siteId
    && row.digest === input.digest
    && row.object_key === input.objectKey
    && row.etag === input.etag
    && row.author_id === input.userId
    && timestamp(row.created_at) === timestamp(input.createdAt)
}

export async function recordPageStudioCheckpoint(
  input: PageStudioCheckpointInput,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<{ acknowledged: true }> {
  if (input.objectKey !== expectedCheckpointObjectKey(input.scope, input.checkpointId)) {
    throw new PageStudioControlError(
      'CHECKPOINT_SCOPE_INVALID',
      400,
      'The checkpoint object key is outside its declared scope'
    )
  }

  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    await requireScopedSite(db, input.scope, 'FOR UPDATE')
    const existing = await db.query<CheckpointRow>(
      `SELECT id, tenant_id, client_id, site_id, digest, object_key, etag, author_id, created_at
       FROM page_studio_checkpoints
       WHERE id = $1
       FOR SHARE`,
      [input.checkpointId]
    )
    if (existing.rows[0]) {
      if (!checkpointMatches(existing.rows[0], input)) {
        throw new PageStudioControlError(
          'CHECKPOINT_CONFLICT',
          409,
          'Checkpoint id already represents different content'
        )
      }
      return { acknowledged: true }
    }

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO page_studio_checkpoints (
         id, tenant_id, client_id, site_id, digest, object_key, etag, author_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        input.checkpointId,
        input.scope.tenantId,
        input.scope.clientId,
        input.scope.siteId,
        input.digest,
        input.objectKey,
        input.etag,
        input.userId,
        input.createdAt
      ]
    )
    if (!inserted.rows[0]) {
      throw new PageStudioControlError(
        'CHECKPOINT_CONFLICT',
        409,
        'Checkpoint id or object key already represents different content'
      )
    }
    await db.query(
      `UPDATE page_studio_sites
       SET current_checkpoint_id = $4, updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.checkpointId]
    )
    await appendMutationAudit(db, {
      scope: input.scope,
      actorId: 'page-studio',
      actorRole: 'service',
      action: 'workspace.checkpointed',
      resourceType: 'checkpoint',
      resourceId: input.checkpointId,
      idempotencyKey: `control:checkpoint:${input.checkpointId}`,
      metadata: { authorId: input.userId, digest: input.digest }
    })
    return { acknowledged: true }
  })
}

export async function getLatestPageStudioCheckpoint(
  scope: PageStudioControlScope,
  dependencies: { queryOne?: typeof queryOne } = {}
): Promise<{ checkpointId: string, digest: string, objectKey: string } | null> {
  const readOne = dependencies.queryOne ?? queryOne
  const row = await readOne<{ checkpoint_id: string, digest: string, object_key: string }>(
    `SELECT checkpoint.id AS checkpoint_id, checkpoint.digest, checkpoint.object_key
     FROM page_studio_sites site
     JOIN page_studio_checkpoints checkpoint
       ON checkpoint.tenant_id = site.tenant_id
      AND checkpoint.client_id = site.client_id
      AND checkpoint.site_id = site.id
      AND checkpoint.id = site.current_checkpoint_id
     WHERE site.tenant_id = $1 AND site.client_id = $2 AND site.id = $3`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )
  return row
    ? { checkpointId: row.checkpoint_id, digest: row.digest, objectKey: row.object_key }
    : null
}

function versionMatches(row: VersionRow, input: PageStudioVersionRegistrationInput): boolean {
  return row.checkpoint_id === input.checkpointId
    && row.digest === input.digest
    && row.author_id === input.userId
    && row.author_role === input.authorRole
    && row.summary === input.summary
}

function mapVersion(row: VersionRow, siteId: string) {
  return {
    authorRole: row.author_role,
    checkpointId: row.checkpoint_id,
    createdAt: timestamp(row.created_at),
    digest: row.digest,
    id: row.id,
    siteId,
    status: row.status
  }
}

export async function registerPageStudioVersion(
  input: PageStudioVersionRegistrationInput,
  dependencies: { runTransaction?: RunTransaction } = {}
) {
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    await requireScopedSite(db, input.scope, 'FOR UPDATE')
    const existing = await db.query<VersionRow>(
      `SELECT id, checkpoint_id, digest, author_id, author_role, summary, status, created_at
       FROM page_studio_versions
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND idempotency_key = $4
       FOR SHARE`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.idempotencyKey]
    )
    if (existing.rows[0]) {
      if (!versionMatches(existing.rows[0], input)) {
        throw new PageStudioControlError(
          'VERSION_CONFLICT',
          409,
          'Version idempotency key already represents a different request'
        )
      }
      return mapVersion(existing.rows[0], input.scope.siteId)
    }

    const checkpoint = await db.query<{ id: string, digest: string }>(
      `SELECT id, digest
       FROM page_studio_checkpoints
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4
       FOR SHARE`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.checkpointId]
    )
    if (!checkpoint.rows[0]) {
      throw new PageStudioControlError(
        'CHECKPOINT_NOT_FOUND',
        404,
        'Durable checkpoint not found in the declared scope'
      )
    }
    if (checkpoint.rows[0].digest !== input.digest) {
      throw new PageStudioControlError(
        'CHECKPOINT_DIGEST_MISMATCH',
        409,
        'Version digest does not match the durable checkpoint'
      )
    }

    const created = await db.query<VersionRow>(
      `INSERT INTO page_studio_versions (
         tenant_id, client_id, site_id, checkpoint_id, digest,
         author_id, author_role, summary, status, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
       RETURNING id, checkpoint_id, digest, author_id, author_role, summary, status, created_at`,
      [
        input.scope.tenantId,
        input.scope.clientId,
        input.scope.siteId,
        input.checkpointId,
        input.digest,
        input.userId,
        input.authorRole,
        input.summary,
        input.idempotencyKey
      ]
    )
    const version = created.rows[0]
    if (!version) throw new Error('Page Studio version insert returned no row')

    await db.query(
      `UPDATE page_studio_sites
       SET current_version_id = $4, updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, version.id]
    )
    await appendMutationAudit(db, {
      scope: input.scope,
      actorId: input.userId,
      actorRole: input.authorRole,
      action: 'version.registered',
      resourceType: 'version',
      resourceId: version.id,
      idempotencyKey: `control:version:${input.idempotencyKey}`,
      metadata: { checkpointId: input.checkpointId, digest: input.digest }
    })
    return mapVersion(version, input.scope.siteId)
  })
}

export async function submitPageStudioVersionForReview(
  input: {
    actorRole: 'agency' | 'client'
    idempotencyKey: string
    scope: PageStudioControlScope
    userId: string
    versionId: string
  },
  dependencies: { runTransaction?: RunTransaction } = {}
) {
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    await requireScopedSite(db, input.scope, 'FOR UPDATE')
    const result = await db.query<VersionRow & { current_version_id: string | null }>(
      `SELECT version.id, version.checkpoint_id, version.digest, version.author_id,
              version.author_role, version.summary, version.status, version.created_at,
              site.current_version_id
       FROM page_studio_versions version
       JOIN page_studio_sites site
         ON site.tenant_id = version.tenant_id
        AND site.client_id = version.client_id
        AND site.id = version.site_id
       WHERE version.tenant_id = $1 AND version.client_id = $2
         AND version.site_id = $3 AND version.id = $4
       FOR UPDATE OF version, site`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.versionId]
    )
    const version = result.rows[0]
    if (!version) {
      throw new PageStudioControlError('VERSION_NOT_FOUND', 404, 'Page Studio version not found')
    }
    if (
      version.current_version_id !== version.id
      || version.author_id !== input.userId
      || version.author_role !== input.actorRole
    ) {
      throw new PageStudioControlError(
        'VERSION_NOT_CURRENT',
        409,
        'Only the current version can be submitted by its author'
      )
    }
    if (version.status === 'in_review') return mapVersion(version, input.scope.siteId)
    if (version.status !== 'draft') {
      throw new PageStudioControlError(
        'VERSION_STATE_INVALID',
        422,
        'Only a draft version can be submitted'
      )
    }
    const updated = await db.query<VersionRow>(
      `UPDATE page_studio_versions
       SET status = 'in_review', submitted_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4
       RETURNING id, checkpoint_id, digest, author_id, author_role, summary, status, created_at`,
      [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.versionId]
    )
    const submitted = updated.rows[0]
    if (!submitted) throw new Error('Page Studio version submission returned no row')
    await appendMutationAudit(db, {
      scope: input.scope,
      actorId: input.userId,
      actorRole: input.actorRole,
      action: 'version.submitted',
      resourceType: 'version',
      resourceId: submitted.id,
      idempotencyKey: input.idempotencyKey,
      metadata: { digest: submitted.digest }
    })
    return mapVersion(submitted, input.scope.siteId)
  })
}

export async function acceptPageStudioAiProposal(
  input: PageStudioAiProposalAcceptanceInput,
  dependencies: { runTransaction?: RunTransaction } = {}
) {
  const { checkpoint } = input
  if (
    checkpoint.objectKey
    !== expectedCheckpointObjectKey(checkpoint.scope, checkpoint.checkpointId)
  ) {
    throw new PageStudioControlError(
      'CHECKPOINT_SCOPE_INVALID',
      422,
      'Checkpoint object key does not match the declared scope'
    )
  }

  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    const siteResult = await db.query<{
      current_checkpoint_id: string | null
      current_digest: string | null
      current_version_id: string | null
    }>(
      `SELECT site.current_checkpoint_id, site.current_version_id,
              current_checkpoint.digest AS current_digest
       FROM page_studio_sites site
       LEFT JOIN page_studio_checkpoints current_checkpoint
         ON current_checkpoint.tenant_id = site.tenant_id
        AND current_checkpoint.client_id = site.client_id
        AND current_checkpoint.site_id = site.id
        AND current_checkpoint.id = site.current_checkpoint_id
       WHERE site.tenant_id = $1 AND site.client_id = $2 AND site.id = $3
       FOR UPDATE OF site`,
      [checkpoint.scope.tenantId, checkpoint.scope.clientId, checkpoint.scope.siteId]
    )
    const site = siteResult.rows[0]
    if (!site) {
      throw new PageStudioControlError(
        'CONTROL_SCOPE_NOT_FOUND',
        404,
        'Page Studio site scope not found'
      )
    }

    const existingVersion = await db.query<VersionRow>(
      `SELECT id, checkpoint_id, digest, author_id, author_role, summary, status, created_at
       FROM page_studio_versions
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND idempotency_key = $4
       FOR SHARE`,
      [
        checkpoint.scope.tenantId,
        checkpoint.scope.clientId,
        checkpoint.scope.siteId,
        input.idempotencyKey
      ]
    )
    const replay = existingVersion.rows[0]
    if (replay) {
      const matches = replay.checkpoint_id === checkpoint.checkpointId
        && replay.digest === checkpoint.digest
        && replay.author_id === checkpoint.userId
        && replay.author_role === input.authorRole
        && replay.summary === input.summary
        && replay.status === 'in_review'
      if (!matches) {
        throw new PageStudioControlError(
          'VERSION_CONFLICT',
          409,
          'AI proposal idempotency key already represents a different request'
        )
      }
      return { checkpointId: checkpoint.checkpointId, versionId: replay.id }
    }

    if (site.current_digest !== input.baseDigest) {
      throw new PageStudioControlError(
        'BASE_DIGEST_MISMATCH',
        409,
        'AI proposal base digest is no longer current'
      )
    }

    const existingCheckpoint = await db.query<CheckpointRow>(
      `SELECT id, tenant_id, client_id, site_id, digest, object_key, etag, author_id, created_at
       FROM page_studio_checkpoints
       WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4
       FOR SHARE`,
      [
        checkpoint.scope.tenantId,
        checkpoint.scope.clientId,
        checkpoint.scope.siteId,
        checkpoint.checkpointId
      ]
    )
    if (existingCheckpoint.rows[0]) {
      if (!checkpointMatches(existingCheckpoint.rows[0], checkpoint)) {
        throw new PageStudioControlError(
          'CHECKPOINT_CONFLICT',
          409,
          'Checkpoint ID already represents different durable metadata'
        )
      }
    } else {
      await db.query(
        `INSERT INTO page_studio_checkpoints (
           id, tenant_id, client_id, site_id, digest, object_key, etag, author_id, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          checkpoint.checkpointId,
          checkpoint.scope.tenantId,
          checkpoint.scope.clientId,
          checkpoint.scope.siteId,
          checkpoint.digest,
          checkpoint.objectKey,
          checkpoint.etag,
          checkpoint.userId,
          checkpoint.createdAt
        ]
      )
    }

    const versionResult = await db.query<VersionRow>(
      `INSERT INTO page_studio_versions (
         tenant_id, client_id, site_id, checkpoint_id, digest,
         author_id, author_role, summary, status, idempotency_key, submitted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'in_review', $9, NOW())
       RETURNING id, checkpoint_id, digest, author_id, author_role, summary, status, created_at`,
      [
        checkpoint.scope.tenantId,
        checkpoint.scope.clientId,
        checkpoint.scope.siteId,
        checkpoint.checkpointId,
        checkpoint.digest,
        checkpoint.userId,
        input.authorRole,
        input.summary,
        input.idempotencyKey
      ]
    )
    const version = versionResult.rows[0]
    if (!version) throw new Error('AI proposal version insert returned no row')

    await db.query(
      `UPDATE page_studio_sites
       SET current_checkpoint_id = $4, current_version_id = $5, updated_at = NOW()
       WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
      [
        checkpoint.scope.tenantId,
        checkpoint.scope.clientId,
        checkpoint.scope.siteId,
        checkpoint.checkpointId,
        version.id
      ]
    )
    await appendMutationAudit(db, {
      scope: checkpoint.scope,
      actorId: checkpoint.userId,
      actorRole: input.authorRole,
      action: 'workspace.checkpointed',
      resourceType: 'checkpoint',
      resourceId: checkpoint.checkpointId,
      idempotencyKey: `control:checkpoint:${checkpoint.checkpointId}`,
      metadata: { digest: checkpoint.digest, objectKey: checkpoint.objectKey }
    })
    await appendMutationAudit(db, {
      scope: checkpoint.scope,
      actorId: checkpoint.userId,
      actorRole: input.authorRole,
      action: 'version.registered',
      resourceType: 'version',
      resourceId: version.id,
      idempotencyKey: `control:version:${input.idempotencyKey}`,
      metadata: { checkpointId: checkpoint.checkpointId, digest: checkpoint.digest }
    })
    await appendMutationAudit(db, {
      scope: checkpoint.scope,
      actorId: checkpoint.userId,
      actorRole: input.authorRole,
      action: 'version.submitted',
      resourceType: 'version',
      resourceId: version.id,
      idempotencyKey: input.idempotencyKey,
      metadata: { digest: checkpoint.digest }
    })

    return { checkpointId: checkpoint.checkpointId, versionId: version.id }
  })
}

function auditMatches(row: AuditRow, input: PageStudioAuditEventInput): boolean {
  return row.action === input.action
    && row.actor_id === input.actorId
    && row.actor_role === input.actorRole
    && timestamp(row.occurred_at) === timestamp(input.occurredAt)
    && row.resource_id === input.resourceId
    && row.resource_type === input.resourceType
}

async function findAuditByIdempotency(
  db: PageStudioControlQueryClient,
  input: PageStudioAuditEventInput
): Promise<AuditRow | undefined> {
  const existing = await db.query<AuditRow>(
    `SELECT actor_id, actor_role, action, resource_type, resource_id, occurred_at
     FROM page_studio_audit_events
     WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND idempotency_key = $4
     FOR SHARE`,
    [input.scope.tenantId, input.scope.clientId, input.scope.siteId, input.idempotencyKey]
  )
  return existing.rows[0]
}

function assertAuditReplay(row: AuditRow, input: PageStudioAuditEventInput): void {
  if (!auditMatches(row, input)) {
    throw new PageStudioControlError(
      'AUDIT_EVENT_CONFLICT',
      409,
      'Audit idempotency key already represents a different event'
    )
  }
}

export async function recordPageStudioAuditEvent(
  input: PageStudioAuditEventInput,
  dependencies: { runTransaction?: RunTransaction } = {}
): Promise<{ acknowledged: true }> {
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  return runTransaction(async (db) => {
    await requireScopedSite(db, input.scope, 'FOR SHARE')
    const existing = await findAuditByIdempotency(db, input)
    if (existing) {
      assertAuditReplay(existing, input)
      return { acknowledged: true }
    }

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, idempotency_key, metadata, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        input.scope.tenantId,
        input.scope.clientId,
        input.scope.siteId,
        input.actorId,
        input.actorRole,
        input.action,
        input.resourceType,
        input.resourceId,
        input.idempotencyKey,
        '{}',
        input.occurredAt
      ]
    )
    if (!inserted.rows[0]) {
      const winner = await findAuditByIdempotency(db, input)
      if (!winner) throw new Error('Page Studio audit conflict returned no winning row')
      assertAuditReplay(winner, input)
    }
    return { acknowledged: true }
  })
}
