import { describe, expect, it, vi } from 'vitest'
import { readCmsGraphSnapshot, assertCmsGraphSnapshotCurrent } from '~~/server/utils/pageStudio/cmsGraphCoordinator'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

const authority = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/pageStudio/cmsCommitAuthority', () => ({ withCmsCommitAuthority: authority }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: vi.fn() }))
const scope = { tenantId: 'tenant', clientId: '10000000-0000-4000-8000-000000000001', businessId: '10000000-0000-4000-8000-000000000001', siteId: '20000000-0000-4000-8000-000000000001', environment: 'staging' }
async function fixture() {
  const generation = '30000000-0000-4000-8000-000000000001', appId = '40000000-0000-4000-8000-000000000001'
  const checkpoint = { id: 'cp_a', digest: 'a'.repeat(64), object_key: 'key' }
  const manifest = { formatVersion: 1, scope, generation, applicationId: appId, checkpoint: { id: checkpoint.id, digest: checkpoint.digest }, schemas: [], components: [], actions: [], previousApplicationId: null }
  const state = { scope_key: JSON.stringify(Object.values(scope)), tenant_id: scope.tenantId, client_id: scope.clientId, business_id: scope.businessId, site_id: scope.siteId, environment: scope.environment, state: 'managed', active_generation: generation, current_application_id: appId, current_content_id: null, freeze_digest: 'b'.repeat(64), target: { accountId: 'a'.repeat(32), databaseId: '50000000-0000-4000-8000-000000000001', name: `ps-content-${'b'.repeat(32)}`, routeId: 'route_a', runtimeDigest: 'c'.repeat(64), collectionReceiptDigest: 'd'.repeat(64), workflowReceiptDigest: 'e'.repeat(64), stagingReceiptDigest: 'f'.repeat(64) } }
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT login_session_hash')) return { rows: [{ login_session_hash: 'a'.repeat(64) }] }
    if (sql.includes('FOR UPDATE OF s')) return { rows: [{ state, application: { id: appId, generation, scope_key: state.scope_key, manifest, digest: await collectionDigest(manifest), previous_application_id: null }, selections: [] }] }
    if (sql.includes('page_studio_cms_scopes')) return { rows: [{ environment: 'staging', state: 'managed' }] }
    if (sql.includes('page_studio_checkpoints')) return { rows: [checkpoint] }
    return { rows: [] }
  })
  authority.mockImplementation(async (_input, work) => work({ query }, scope))
  const principal = { source: 'studio-session', claims: { userId: 'actor', nonce: 'nonce', role: 'agency', tenantId: scope.tenantId, clientId: scope.clientId, siteId: scope.siteId }, env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' }, capability: 'workspace:checkpoint' } as Parameters<typeof readCmsGraphSnapshot>[0]
  return { principal, checkpoint, query, state }
}
describe('authorized managed graph snapshots', () => {
  it('returns the exact native application only inside authority admission', async () => {
    const f = await fixture()
    const snapshot = await readCmsGraphSnapshot(f.principal)
    expect(snapshot.context.application.manifest.checkpoint.id).toBe('cp_a')
    expect(authority).toHaveBeenLastCalledWith(expect.objectContaining({ mutation: 'business-content', principal: f.principal }), expect.any(Function), expect.any(Object))
    expect(Object.isFrozen(snapshot.context.application.manifest)).toBe(true)
  })
  it('rechecks authority and rejects a checkpoint changed while private bytes loaded', async () => {
    const f = await fixture()
    const snapshot = await readCmsGraphSnapshot(f.principal)
    f.checkpoint.id = 'cp_b'
    await expect(assertCmsGraphSnapshotCurrent(snapshot, f.principal)).rejects.toThrow()
  })
  it('cannot replay a snapshot after authority is revoked', async () => {
    const f = await fixture()
    const snapshot = await readCmsGraphSnapshot(f.principal)
    authority.mockRejectedValueOnce(new Error('revoked'))
    await expect(assertCmsGraphSnapshotCurrent(snapshot, f.principal)).rejects.toThrow('revoked')
  })
})
