import { describe, expect, it, vi } from 'vitest'

import {
  getLatestPageStudioCheckpoint,
  recordPageStudioAuditEvent,
  recordPageStudioCheckpoint,
  registerPageStudioVersion,
  submitPageStudioVersionForReview,
  type PageStudioControlQueryClient
} from '~~/server/utils/pageStudio/controlStore'

const scope = {
  tenantId: 'tenant-alpha',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const userId = '33333333-3333-4333-8333-333333333333'
const checkpointId = 'checkpoint_01HXYZ'
const digest = 'a'.repeat(64)
const objectKey = `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpointId}.json`
const checkpoint = {
  checkpointId,
  createdAt: '2026-08-30T01:00:00.000Z',
  digest,
  etag: 'etag-1',
  objectKey,
  scope,
  userId
}

function database(respond: (sql: string, params: unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => ({ rows: respond(sql, params) }))
  const client = { query } as PageStudioControlQueryClient
  const runTransaction = vi.fn(async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) => callback(client))
  return { client, query, runTransaction }
}

describe('Page Studio internal control store', () => {
  it('rejects a checkpoint object key outside the exact declared scope before opening a transaction', async () => {
    const db = database(() => [])

    await expect(recordPageStudioCheckpoint({
      ...checkpoint,
      objectKey: `tenants/other/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpointId}.json`
    }, { runTransaction: db.runTransaction })).rejects.toMatchObject({
      code: 'CHECKPOINT_SCOPE_INVALID',
      statusCode: 400
    })
    expect(db.runTransaction).not.toHaveBeenCalled()
  })

  it('acknowledges an exact checkpoint replay without mutating or moving the current pointer', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites') && sql.includes('FOR UPDATE')) {
        return [{ id: scope.siteId, current_checkpoint_id: 'checkpoint_newer' }]
      }
      if (sql.includes('FROM page_studio_checkpoints')) {
        return [{
          id: checkpointId,
          tenant_id: scope.tenantId,
          client_id: scope.clientId,
          site_id: scope.siteId,
          digest,
          object_key: objectKey,
          etag: checkpoint.etag,
          author_id: userId,
          created_at: checkpoint.createdAt
        }]
      }
      return []
    })

    await expect(recordPageStudioCheckpoint(checkpoint, {
      runTransaction: db.runTransaction
    })).resolves.toEqual({ acknowledged: true })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE page_studio_sites'))).toBe(false)
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_audit_events'))).toBe(false)
  })

  it('treats equivalent canonical checkpoint timestamps as the same immutable content', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('FROM page_studio_checkpoints')) {
        return [{
          id: checkpointId,
          tenant_id: scope.tenantId,
          client_id: scope.clientId,
          site_id: scope.siteId,
          digest,
          object_key: objectKey,
          etag: checkpoint.etag,
          author_id: userId,
          created_at: '2026-08-30T01:00:00.000Z'
        }]
      }
      return []
    })

    await expect(recordPageStudioCheckpoint({
      ...checkpoint,
      createdAt: '2026-08-30T01:00:00Z'
    }, { runTransaction: db.runTransaction })).resolves.toEqual({ acknowledged: true })
  })

  it('returns 409 when a checkpoint id is replayed with different immutable content', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId, current_checkpoint_id: null }]
      if (sql.includes('FROM page_studio_checkpoints')) {
        return [{
          id: checkpointId,
          tenant_id: scope.tenantId,
          client_id: scope.clientId,
          site_id: scope.siteId,
          digest: 'b'.repeat(64),
          object_key: objectKey,
          etag: checkpoint.etag,
          author_id: userId,
          created_at: checkpoint.createdAt
        }]
      }
      return []
    })

    await expect(recordPageStudioCheckpoint(checkpoint, {
      runTransaction: db.runTransaction
    })).rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT', statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE page_studio_sites'))).toBe(false)
  })

  it('inserts a new checkpoint before advancing the pointer and audits within the transaction', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId, current_checkpoint_id: null }]
      if (sql.includes('INSERT INTO page_studio_checkpoints')) return [{ id: checkpointId }]
      return []
    })

    await expect(recordPageStudioCheckpoint(checkpoint, {
      runTransaction: db.runTransaction
    })).resolves.toEqual({ acknowledged: true })

    const statements = db.query.mock.calls.map(([sql]) => String(sql))
    expect(statements.findIndex(sql => sql.includes('INSERT INTO page_studio_checkpoints')))
      .toBeLessThan(statements.findIndex(sql => sql.includes('UPDATE page_studio_sites')))
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_audit_events'),
      expect.arrayContaining(['workspace.checkpointed', 'checkpoint', checkpointId])
    )
  })

  it('turns a concurrent checkpoint uniqueness race into a stable 409', async () => {
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      return []
    })

    await expect(recordPageStudioCheckpoint(checkpoint, {
      runTransaction: db.runTransaction
    })).rejects.toMatchObject({ code: 'CHECKPOINT_CONFLICT', statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE page_studio_sites'))).toBe(false)
  })

  it('reads the latest checkpoint from the authoritative site pointer in the exact scope', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      checkpoint_id: checkpointId,
      digest,
      object_key: objectKey
    })

    await expect(getLatestPageStudioCheckpoint(scope, { queryOne })).resolves.toEqual({
      checkpointId,
      digest,
      objectKey
    })
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining('site.current_checkpoint_id'), [
      scope.tenantId, scope.clientId, scope.siteId
    ])
  })

  it('registers a draft only from a same-scope durable checkpoint and advances the version pointer', async () => {
    const versionId = '44444444-4444-4444-8444-444444444444'
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) {
        return [{ id: scope.siteId, current_version_id: '55555555-5555-4555-8555-555555555555' }]
      }
      if (sql.includes('FROM page_studio_versions')) return []
      if (sql.includes('FROM page_studio_checkpoints')) return [{ id: checkpointId, digest }]
      if (sql.includes('INSERT INTO page_studio_versions')) {
        return [{
          id: versionId,
          checkpoint_id: checkpointId,
          digest,
          author_role: 'client',
          status: 'draft',
          created_at: '2026-08-30T02:00:00.000Z'
        }]
      }
      return []
    })

    await expect(registerPageStudioVersion({
      authorRole: 'client',
      checkpointId,
      digest,
      idempotencyKey: 'version-request-01HXYZ',
      scope,
      summary: 'Updated campaign headline',
      userId
    }, { runTransaction: db.runTransaction })).resolves.toEqual({
      authorRole: 'client',
      checkpointId,
      createdAt: '2026-08-30T02:00:00.000Z',
      digest,
      id: versionId,
      siteId: scope.siteId,
      status: 'draft'
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('\'draft\''),
      expect.arrayContaining([scope.tenantId, scope.clientId, scope.siteId, checkpointId, digest])
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SET current_version_id'),
      [scope.tenantId, scope.clientId, scope.siteId, versionId]
    )
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_audit_events'),
      expect.arrayContaining(['version.registered', 'version', versionId])
    )
  })

  it('rejects a version when the checkpoint is absent from the declared scope or has another digest', async () => {
    for (const checkpointRows of [[], [{ id: checkpointId, digest: 'b'.repeat(64) }]]) {
      const db = database((sql) => {
        if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId, current_version_id: null }]
        if (sql.includes('FROM page_studio_versions')) return []
        if (sql.includes('FROM page_studio_checkpoints')) return checkpointRows
        return []
      })

      await expect(registerPageStudioVersion({
        authorRole: 'agency', checkpointId, digest, idempotencyKey: 'version-request-01HXYZ',
        scope, summary: 'First version', userId
      }, { runTransaction: db.runTransaction })).rejects.toMatchObject({
        code: checkpointRows.length === 0 ? 'CHECKPOINT_NOT_FOUND' : 'CHECKPOINT_DIGEST_MISMATCH'
      })
      expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO page_studio_versions'))).toBe(false)
    }
  })

  it('returns the original version for an exact idempotency replay and conflicts on changed input', async () => {
    const existing = {
      id: '44444444-4444-4444-8444-444444444444',
      checkpoint_id: checkpointId,
      digest,
      author_id: userId,
      author_role: 'agency',
      summary: 'First version',
      status: 'draft',
      created_at: '2026-08-30T02:00:00.000Z'
    }
    const input = {
      authorRole: 'agency' as const, checkpointId, digest, idempotencyKey: 'version-request-01HXYZ',
      scope, summary: 'First version', userId
    }
    const exactDb = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId, current_version_id: existing.id }]
      if (sql.includes('FROM page_studio_versions')) return [existing]
      return []
    })

    await expect(registerPageStudioVersion(input, {
      runTransaction: exactDb.runTransaction
    })).resolves.toMatchObject({ id: existing.id, status: 'draft' })
    expect(exactDb.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE page_studio_sites'))).toBe(false)

    const conflictDb = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId, current_version_id: existing.id }]
      if (sql.includes('FROM page_studio_versions')) return [{ ...existing, summary: 'Changed request' }]
      return []
    })
    await expect(registerPageStudioVersion(input, {
      runTransaction: conflictDb.runTransaction
    })).rejects.toMatchObject({ code: 'VERSION_CONFLICT', statusCode: 409 })
  })

  it('submits only the current author-owned draft and audits the review transition', async () => {
    const versionId = '44444444-4444-4444-8444-444444444444'
    const version = {
      id: versionId,
      checkpoint_id: checkpointId,
      digest,
      author_id: userId,
      author_role: 'agency' as const,
      summary: 'AI page proposal',
      status: 'draft' as const,
      created_at: '2026-08-30T02:00:00.000Z',
      current_version_id: versionId
    }
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites') && !sql.includes('JOIN')) return [{ id: scope.siteId }]
      if (sql.includes('FROM page_studio_versions version')) return [version]
      if (sql.includes('UPDATE page_studio_versions')) return [{ ...version, status: 'in_review' }]
      return []
    })

    await expect(submitPageStudioVersionForReview({
      actorRole: 'agency',
      idempotencyKey: 'submit-proposal-01HXYZ',
      scope,
      userId,
      versionId
    }, { runTransaction: db.runTransaction })).resolves.toMatchObject({
      id: versionId,
      status: 'in_review'
    })
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_audit_events'),
      expect.arrayContaining(['version.submitted', 'version', versionId, 'submit-proposal-01HXYZ'])
    )
  })

  it('accepts only an exact typed audit replay and stores no caller-controlled metadata', async () => {
    const audit = {
      action: 'workspace.previewed' as const,
      actorId: userId,
      actorRole: 'client' as const,
      idempotencyKey: 'workspace.previewed:workspace_01:2026-08-30T03:00:00.000Z',
      occurredAt: '2026-08-30T03:00:00Z',
      resourceId: 'workspace_01',
      resourceType: 'workspace' as const,
      scope
    }
    const db = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('SELECT') && sql.includes('page_studio_audit_events')) {
        return [{
          action: audit.action,
          actor_id: audit.actorId,
          actor_role: audit.actorRole,
          occurred_at: '2026-08-30T03:00:00.000Z',
          resource_id: audit.resourceId,
          resource_type: audit.resourceType
        }]
      }
      return []
    })
    await expect(recordPageStudioAuditEvent(audit, {
      runTransaction: db.runTransaction
    })).resolves.toEqual({ acknowledged: true })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false)

    const newDb = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      if (sql.includes('INSERT INTO page_studio_audit_events')) return [{ id: 'audit-1' }]
      return []
    })
    await recordPageStudioAuditEvent(audit, { runTransaction: newDb.runTransaction })
    expect(newDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO page_studio_audit_events'),
      expect.arrayContaining([audit.idempotencyKey, '{}'])
    )

    const conflictDb = database((sql) => {
      if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
      return sql.includes('SELECT')
        ? [{
            action: audit.action,
            actor_id: audit.actorId,
            actor_role: 'service',
            occurred_at: audit.occurredAt,
            resource_id: audit.resourceId,
            resource_type: audit.resourceType
          }]
        : []
    })
    await expect(recordPageStudioAuditEvent(audit, {
      runTransaction: conflictDb.runTransaction
    })).rejects.toMatchObject({ code: 'AUDIT_EVENT_CONFLICT', statusCode: 409 })
  })

  it('classifies a concurrent audit insert race as an exact replay or stable conflict', async () => {
    const audit = {
      action: 'session.revoked' as const,
      actorId: 'page-studio',
      actorRole: 'service' as const,
      idempotencyKey: 'session.revoked:session_01:2026-08-30T03:00:00.000Z',
      occurredAt: '2026-08-30T03:00:00.000Z',
      resourceId: 'session_01',
      resourceType: 'session' as const,
      scope
    }

    for (const actorRole of ['service', 'client']) {
      let insertAttempted = false
      const db = database((sql) => {
        if (sql.includes('FROM page_studio_sites')) return [{ id: scope.siteId }]
        if (sql.includes('INSERT INTO page_studio_audit_events')) {
          insertAttempted = true
          return []
        }
        if (sql.includes('FROM page_studio_audit_events') && insertAttempted) {
          return [{
            action: audit.action,
            actor_id: audit.actorId,
            actor_role: actorRole,
            occurred_at: audit.occurredAt,
            resource_id: audit.resourceId,
            resource_type: audit.resourceType
          }]
        }
        return []
      })

      const result = recordPageStudioAuditEvent(audit, { runTransaction: db.runTransaction })
      if (actorRole === 'service') {
        await expect(result).resolves.toEqual({ acknowledged: true })
      } else {
        await expect(result).rejects.toMatchObject({
          code: 'AUDIT_EVENT_CONFLICT',
          statusCode: 409
        })
      }
    }
  })

  it('does not record an audit event for an unknown site scope', async () => {
    const db = database(() => [])
    await expect(recordPageStudioAuditEvent({
      action: 'session.revoked',
      actorId: 'page-studio',
      actorRole: 'service',
      idempotencyKey: 'session.revoked:session_01:2026-08-30T03:00:00.000Z',
      occurredAt: '2026-08-30T03:00:00.000Z',
      resourceId: 'session_01',
      resourceType: 'session',
      scope
    }, { runTransaction: db.runTransaction })).rejects.toMatchObject({
      code: 'CONTROL_SCOPE_NOT_FOUND',
      statusCode: 404
    })
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false)
  })
})
