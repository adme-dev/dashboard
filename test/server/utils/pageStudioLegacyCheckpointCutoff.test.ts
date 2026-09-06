import { describe, expect, it, vi } from 'vitest'
import {
  commitPageStudioCheckpoint,
  recordPageStudioCheckpoint,
  type PageStudioControlQueryClient,
  type PageStudioControlScope
} from '~~/server/utils/pageStudio/controlStore'

const scope = {
  tenantId: 'tenant-cutoff',
  clientId: '22222222-2222-4222-8222-222222222222',
  siteId: '11111111-1111-4111-8111-111111111111'
}
const checkpoint = {
  checkpointId: 'checkpoint_legacy_request',
  createdAt: '2026-09-06T00:00:00.000Z',
  digest: 'a'.repeat(64),
  etag: 'etag-legacy-request',
  objectKey: `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/checkpoint_legacy_request.json`,
  scope,
  userId: '33333333-3333-4333-8333-333333333333'
}

interface AuditFixture {
  scope: PageStudioControlScope
  actorRole: 'service' | 'agency'
  metadata: Record<string, string>
}

function guardedAudit(actorRole: AuditFixture['actorRole'] = 'service'): AuditFixture {
  return { scope, actorRole, metadata: { commitProtocol: 'cas-v1', expectedCheckpointId: 'checkpoint_original_base' } }
}

function database(options: { audits?: AuditFixture[], replay?: boolean, head?: string | null } = {}) {
  let head = options.head === undefined ? 'checkpoint_later_legacy' : options.head
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM page_studio_sites')) return { rows: [{ id: scope.siteId, current_checkpoint_id: head }] }
    if (sql.includes('FROM page_studio_audit_events')) {
      // Model the scoped audit read at the DB boundary. Unscoped queries see
      // foreign rows, so the isolation checks cannot pass by hiding those rows.
      const matchesScope = (audit: AuditFixture) => [
        ['tenant_id', audit.scope.tenantId],
        ['client_id', audit.scope.clientId],
        ['site_id', audit.scope.siteId]
      ].every(([column, value]) => {
        const parameter = new RegExp(`\\b${column}\\s*=\\s*\\$(\\d+)`, 'i').exec(sql)
        return !parameter || params[Number(parameter[1]) - 1] === value
      })
      const filtersProtocol = sql.includes('commitProtocol') && (sql.includes('cas-v1') || params.includes('cas-v1'))
      return { rows: (options.audits ?? []).filter(audit => matchesScope(audit)
        && (!filtersProtocol || audit.metadata.commitProtocol === 'cas-v1')).map(audit => ({
        id: 'audit_first_guarded_checkpoint',
        action: 'workspace.checkpointed',
        actor_role: audit.actorRole,
        resource_type: 'checkpoint',
        resource_id: 'checkpoint_first_guarded',
        metadata: audit.metadata
      })) }
    }
    if (sql.includes('FROM page_studio_checkpoints')) return { rows: options.replay
      ? [{
          id: checkpoint.checkpointId, tenant_id: scope.tenantId, client_id: scope.clientId,
          site_id: scope.siteId, digest: checkpoint.digest, object_key: checkpoint.objectKey,
          etag: checkpoint.etag, author_id: checkpoint.userId, created_at: checkpoint.createdAt
        }]
      : [] }
    if (sql.includes('INSERT INTO page_studio_checkpoints')) return { rows: [{ id: checkpoint.checkpointId }] }
    if (sql.includes('UPDATE page_studio_sites')) head = params[3] as string
    return { rows: [] }
  })
  return {
    query,
    getHead: () => head,
    runTransaction: async <T>(callback: (db: PageStudioControlQueryClient) => Promise<T>) =>
      callback({ query } as PageStudioControlQueryClient)
  }
}

describe('legacy checkpoint writer cutoff after guarded activation', () => {
  it.each(['service', 'agency'] as const)('rejects legacy writes after a %s guarded checkpoint even when the head has since moved', async (actorRole) => {
    const db = database({ audits: [guardedAudit(actorRole)] })
    await expect(recordPageStudioCheckpoint(checkpoint, db)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
    expect(db.getHead()).toBe('checkpoint_later_legacy')
    const activation = db.query.mock.calls.find(([sql]) => sql.includes('FROM page_studio_audit_events'))
    expect(activation).toBeDefined()
    expect(activation?.[0]).toContain('workspace.checkpointed')
    expect(activation?.[0]).toContain('commitProtocol')
    expect(activation?.[0]).not.toMatch(/\b(?:resource_id|idempotency_key|actor_role|actor_id)\s*=/)
    expect(activation?.[1]).not.toContain('checkpoint_later_legacy')
  })

  it('rejects even an exact legacy retry after activation without rewinding or writing', async () => {
    const db = database({ audits: [guardedAudit()], replay: true })
    await expect(recordPageStudioCheckpoint(checkpoint, db)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE)\b/.test(sql))).toBe(false)
    expect(db.getHead()).toBe('checkpoint_later_legacy')
  })

  it.each([
    { audits: [] as AuditFixture[] },
    { audits: [{ scope, actorRole: 'service', metadata: { digest: checkpoint.digest } }] as AuditFixture[] }
  ])(
    'allows legacy bootstrap before guarded activation with prior audits %j', async ({ audits }) => {
      const db = database({ audits, head: null })
      await expect(recordPageStudioCheckpoint(checkpoint, db)).resolves.toEqual({ acknowledged: true })
      expect(db.getHead()).toBe(checkpoint.checkpointId)
      expect(db.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO page_studio_checkpoints'))).toHaveLength(1)
    }
  )

  it.each([
    { tenantId: 'other-tenant' },
    { clientId: '44444444-4444-4444-8444-444444444444' },
    { siteId: '55555555-5555-4555-8555-555555555555' }
  ])('does not activate the requested site from a foreign guarded audit %j', async (foreignScope) => {
    const db = database({ audits: [{ ...guardedAudit(), scope: { ...scope, ...foreignScope } }] })
    await expect(recordPageStudioCheckpoint(checkpoint, db)).resolves.toEqual({ acknowledged: true })
    const activation = db.query.mock.calls.find(([sql]) => sql.includes('FROM page_studio_audit_events'))
    expect(activation).toBeDefined()
    for (const [column, value] of [['tenant_id', scope.tenantId], ['client_id', scope.clientId], ['site_id', scope.siteId]]) {
      const parameter = new RegExp(`\\b${column}\\s*=\\s*\\$(\\d+)`, 'i').exec(activation?.[0] ?? '')
      expect(parameter, `${column} must scope the immutable activation lookup`).not.toBeNull()
      expect(activation?.[1]?.[Number(parameter?.[1]) - 1]).toBe(value)
    }
    expect(db.getHead()).toBe(checkpoint.checkpointId)
  })

  it('continues accepting an explicitly guarded commit after activation', async () => {
    const db = database({ audits: [guardedAudit()] })
    await expect(commitPageStudioCheckpoint({ checkpoint, expectedCheckpointId: 'checkpoint_later_legacy' }, db))
      .resolves.toEqual({
        acknowledged: true,
        checkpointId: checkpoint.checkpointId,
        currentCheckpointId: checkpoint.checkpointId,
        isCurrent: true
      })
    expect(db.getHead()).toBe(checkpoint.checkpointId)
  })
})
