import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchCustomerEditor } from '../../../server/utils/pageStudio/customerEditorLaunch'

const mocks = vi.hoisted(() => ({ adoption: vi.fn(), completion: vi.fn(), authority: vi.fn(), handoff: vi.fn(), storage: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/cmsAdoptionReceipt', () => ({ readManagedCmsAdoptionReceipt: mocks.adoption }))
vi.mock('~~/server/utils/pageStudio/managedTransferCompletionRead', () => ({ readCurrentManagedTransferCompletion: mocks.completion }))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({ readCustomerSession: async () => ({ identityId: 'identity' }), readCustomerSetup: async () => ({ workspaceId: 'workspace' }) }))
vi.mock('~~/server/utils/pageStudio/customerWorkspaces', () => ({ resolveCustomerWorkspaceAccess: async () => ({ role: 'owner', legacyBinding: null }) }))
vi.mock('~~/server/utils/pageStudio/customerEditorAuthority', () => ({ readCustomerEditorAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/customerEditorHandoff', () => ({ issueCustomerEditorHandoff: mocks.handoff, parseCustomerEditorHandoffConfiguration: () => ({ environment: 'production' }) }))
vi.mock('~~/server/utils/pageStudio/cmsGraphCoordinator', () => ({ assertSoleCmsAuthoringScope: async () => {} }))
vi.mock('~~/server/utils/pageStudio/cmsVisibility', () => ({ lockCmsContext: async () => ({ application: { manifest: { checkpoint: { id: 'checkpoint', digest: 'a'.repeat(64) } } } }), cmsEqual: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b) }))
vi.mock('~~/server/utils/pageStudio/customerEditorStorage', () => ({ withVerifiedCustomerEditorStorage: mocks.storage }))
const scope = { tenantId: 'tenant', businessId: 'business', clientId: 'business', siteId: 'site', environment: 'production' as const }
const db = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('customer_site_requests') ? [{ site_id: 'site', entitlement_id: 'plan' }] : sql.includes('cms_scopes') ? [{ state: 'managed', adoption_id: null, transfer_id: 'transfer' }] : [{ id: 'checkpoint', digest: 'a'.repeat(64), object_key: 'key' }] })) }
const options = { configuration: {}, env: { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production' }, runTransaction: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db) }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.completion.mockReset().mockResolvedValue({ operationId: 'transfer', digest: 'receipt' })
  mocks.authority.mockReset().mockResolvedValue({ identityId: 'identity', owned: { workspaceId: 'workspace', scope } })
  mocks.handoff.mockResolvedValue({ token: 'transport-ticket' })
  // Exercise both native snapshots on either side of the separately tested
  // private-storage verifier. This seam performs no authorizing fallback.
  mocks.storage.mockImplementation(async (snapshot, _options, finish) => {
    const before = await snapshot(db)
    const after = await snapshot(db)
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Changed snapshot')
    return finish(db, after)
  })
})
describe('customer editor completed managed origin', () => {
  it('issues a handoff after two current completion-origin snapshots without adoption', async () => {
    expect(await launchCustomerEditor('a'.repeat(64), options)).toEqual({ token: 'transport-ticket' })
    expect(mocks.completion).toHaveBeenCalledTimes(2)
    expect(mocks.adoption).not.toHaveBeenCalled()
    expect(mocks.authority).toHaveBeenCalledTimes(4)
    expect(mocks.authority.mock.calls.every(([, receipt]) => receipt.environment === 'production' && receipt.entitlement_id === 'plan')).toBe(true)
  })
  it('withholds a ticket after completion origin changes during storage', async () => {
    mocks.completion.mockResolvedValueOnce({ operationId: 'transfer', digest: 'original' }).mockResolvedValueOnce({ operationId: 'transfer', digest: 'changed' })
    await expect(launchCustomerEditor('a'.repeat(64), options)).rejects.toThrow('Changed snapshot')
    expect(mocks.handoff).not.toHaveBeenCalled()
  })
  it('withholds a ticket when current production ownership is withdrawn', async () => {
    mocks.authority.mockResolvedValueOnce({ identityId: 'identity', owned: { workspaceId: 'workspace', scope } }).mockRejectedValueOnce(new Error('Revoked'))
    await expect(launchCustomerEditor('a'.repeat(64), options)).rejects.toThrow('Revoked')
    expect(mocks.handoff).not.toHaveBeenCalled()
  })
})
