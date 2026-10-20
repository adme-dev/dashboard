import { destinationActivation } from '../../helpers/pageStudioDestinationActivation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readCustomerManagedTransfer, recoverCustomerManagedTransfer } from '~~/server/utils/pageStudio/customerManagedTransfer'

const mocks = vi.hoisted(() => ({ authority: vi.fn(), completion: vi.fn(), remote: vi.fn(), query: vi.fn(), session: vi.fn(), inspection: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/customerSignup', () => ({ readCustomerSession: mocks.session }))
vi.mock('~~/shared/pageStudio/customerInspectionAuthority', () => ({ requireCustomerInspectionAuthority: mocks.inspection }))
vi.mock('~~/server/utils/pageStudio/customerAuthoringAuthority', () => ({ withCustomerProductionAuthoringAuthority: mocks.authority }))
vi.mock('~~/server/utils/pageStudio/managedTransferCompletionRead', () => ({ readCurrentManagedTransferCompletion: mocks.completion }))
vi.mock('~~/server/utils/pageStudio/completedManagedTransfer', () => ({ callCompletedManagedTransfer: mocks.remote }))
const siteId = '00000000-0000-4000-8000-000000000001'
const planId = '00000000-0000-4000-8000-000000000002'
const scope = { tenantId: 'tenant', businessId: 'business', clientId: 'business', siteId, environment: 'production' as const }
const current = { identityId: 'identity', accountId: 'account', workspaceId: 'workspace', entitlementId: planId, scope }
const completion = { digest: 'a'.repeat(64) }
const env = { PAGE_STUDIO_CUSTOMER_PRODUCTION_EDITOR_ENABLED: 'true', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
const status = { siteId, completed: true, editorConnection: 'pending', sourceRetention: 'pending', canRetryConnection: true, canRetryRetention: true }
const deps = { env, runTransaction: async <T>(work: (db: { query: typeof mocks.query }) => Promise<T>) => work({ query: mocks.query }) }
const token = 'a'.repeat(64)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockRejectedValue({ statusCode: 403 })
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT entitlement_id') ? [{ entitlement_id: planId }] : [] }))
  mocks.authority.mockImplementation(async (_input, work, dependencies) => dependencies.runTransaction((db: unknown) => work(db, current)))
  mocks.completion.mockResolvedValue(completion)
  mocks.remote.mockResolvedValue(status)
})
describe('current customer transfer projection', () => {
  it('returns safe completed progress under this login without old transfer sessions', async () => {
    expect(await readCustomerManagedTransfer(token, siteId, deps)).toEqual({ stage: 'completed', ...status })
    expect(mocks.remote).toHaveBeenCalledWith({ siteId, action: 'status' }, { env })
    expect(mocks.authority).toHaveBeenCalledTimes(2)
    expect(mocks.authority.mock.calls.every(([input]) => input.siteId === siteId && input.entitlementId === planId && /^[a-f0-9]{64}$/.test(input.loginSessionHash))).toBe(true)
    expect(JSON.stringify(await readCustomerManagedTransfer(token, siteId, deps))).not.toContain(completion.digest)
  })
  it('rejects an unlisted destination before the private call and rechecks expiry after it', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const scoped = { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', ...destinationActivation(workspaceId) }
    await expect(recoverCustomerManagedTransfer(token, siteId, { action: 'retry-connection' }, { ...deps, env: scoped })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.remote).not.toHaveBeenCalled()
    mocks.authority.mockImplementation(async (_input, work, dependencies) => dependencies.runTransaction((db: unknown) => work(db, { ...current, workspaceId })))
    mocks.remote.mockImplementation(async () => {
      Object.assign(scoped, destinationActivation(workspaceId, '2020-01-01T00:00:00Z'))
      return status
    })
    await expect(recoverCustomerManagedTransfer(token, siteId, { action: 'retry-connection' }, { ...deps, env: scoped })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.remote).toHaveBeenCalledTimes(1)
  })
  it('keeps completion visible but all recovery closed when the editor rollout is disabled', async () => {
    const value = await readCustomerManagedTransfer(token, siteId, { ...deps, env: { ...env, PAGE_STUDIO_CUSTOMER_PRODUCTION_EDITOR_ENABLED: 'false' } })
    expect(value).toMatchObject({ stage: 'completed', completed: true, editorConnection: 'unavailable', canRetryConnection: false, canRetryRetention: false })
    expect(mocks.remote).not.toHaveBeenCalled()
  })
  it('projects saved precompletion progress without old-session status RPC or generic resume', async () => {
    mocks.completion.mockResolvedValue(null)
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT entitlement_id') ? [{ entitlement_id: planId }] : [{ entitlement_id: planId, resources_bound: true, source_frozen: true, destination_verified: true, copy_verified: false, history_verified: false }] }))
    expect(await readCustomerManagedTransfer(token, siteId, deps)).toEqual({ siteId, completed: false, stage: 'copying-content', canRetryConnection: false, canRetryRetention: false })
    expect(mocks.remote).not.toHaveBeenCalled()
  })
  it('returns no progress without an owned retained transfer', async () => {
    mocks.completion.mockResolvedValue(null)
    expect(await readCustomerManagedTransfer(token, siteId, deps)).toBeNull()
  })
  it('preserves completed state after an uncertain status RPC but never permits a guessed retry', async () => {
    mocks.remote.mockRejectedValue(new Error('private provider details'))
    const value = await readCustomerManagedTransfer(token, siteId, deps)
    expect(value).toMatchObject({ completed: true, editorConnection: 'unavailable', sourceRetention: 'unavailable', canRetryConnection: false })
    expect(JSON.stringify(value)).not.toContain('private provider')
    expect(mocks.authority).toHaveBeenCalledTimes(2)
  })
  it.each(['completion', 'plan', 'identity'])('rejects changed %s after private status', async (field) => {
    mocks.remote.mockImplementation(async () => {
      if (field === 'completion') mocks.completion.mockResolvedValue({ digest: 'b'.repeat(64) })
      else mocks.authority.mockImplementation(async (_input, work, dependencies) => dependencies.runTransaction((db: unknown) => work(db, { ...current, ...(field === 'plan' ? { entitlementId: 'other' } : { identityId: 'other' }) })))
      return status
    })
    await expect(readCustomerManagedTransfer(token, siteId, deps)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('checks current authority even after a failed private call', async () => {
    mocks.remote.mockImplementation(async () => {
      mocks.authority.mockRejectedValue({ statusCode: 401 })
      throw new Error('timeout')
    })
    await expect(readCustomerManagedTransfer(token, siteId, deps)).rejects.toMatchObject({ statusCode: 401 })
  })
  it.each([{ siteId: 'other' }, { privateProof: 'secret' }, { completed: false }])('withholds malformed or substituted status %j', async (change) => {
    mocks.remote.mockResolvedValue({ ...status, ...change })
    expect(await readCustomerManagedTransfer(token, siteId, deps)).toMatchObject({ editorConnection: 'unavailable', canRetryConnection: false })
  })
})
describe('explicit current-owner completion recovery', () => {
  it.each([['retry-connection', 'connect'], ['retry-retention', 'retain']] as const)('maps only %s to the fixed private action', async (action, privateAction) => {
    expect(await recoverCustomerManagedTransfer(token, siteId, { action }, deps)).toMatchObject({ completed: true })
    expect(mocks.remote).toHaveBeenCalledTimes(2)
    expect(mocks.remote.mock.calls.map(([request]) => request.action)).toEqual(['status', privateAction])
  })
  it('rejects caller operation/proof selection', async () => {
    await expect(recoverCustomerManagedTransfer(token, siteId, { action: 'retry-connection', operationId: 'forged' }, deps)).rejects.toThrow()
    expect(mocks.remote).not.toHaveBeenCalled()
  })
  it('does not mutate without completion or explicit current recovery permission', async () => {
    mocks.remote.mockResolvedValue({ ...status, canRetryConnection: false })
    await expect(recoverCustomerManagedTransfer(token, siteId, { action: 'retry-connection' }, deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.remote).toHaveBeenCalledTimes(1)
    mocks.remote.mockClear()
    mocks.completion.mockResolvedValue(null)
    await expect(recoverCustomerManagedTransfer(token, siteId, { action: 'retry-retention' }, deps)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.remote).not.toHaveBeenCalled()
  })
  it('never automatically retries an uncertain mutation', async () => {
    mocks.remote.mockResolvedValueOnce(status).mockRejectedValueOnce(new Error('acknowledgement lost'))
    await expect(recoverCustomerManagedTransfer(token, siteId, { action: 'retry-connection' }, deps)).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.remote).toHaveBeenCalledTimes(2)
    expect(mocks.authority).toHaveBeenCalledTimes(4)
  })
})

describe('inspection-only transfer projection', () => {
  it.each(['viewer', 'withdrawn-plan'])('keeps completed progress closed without owner authoring authority: %s', async () => {
    mocks.authority.mockRejectedValue({ statusCode: 403 })
    mocks.session.mockResolvedValue({ identityId: current.identityId, accountId: current.accountId })
    mocks.inspection.mockResolvedValue({ tenantId: scope.tenantId, clientId: scope.clientId, workspaceId: current.workspaceId, canManagePublication: false })
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT entitlement_id') ? [{ entitlement_id: planId }] : [{ operation_id: siteId }] }))
    expect(await readCustomerManagedTransfer(token, siteId, deps)).toMatchObject({ completed: true, editorConnection: 'unavailable', sourceRetention: 'unavailable', canRetryConnection: false, canRetryRetention: false })
    expect(mocks.remote).not.toHaveBeenCalled()
    expect(mocks.session).toHaveBeenCalledTimes(2)
    expect(mocks.inspection).toHaveBeenCalledTimes(2)
    await expect(recoverCustomerManagedTransfer(token, siteId, { action: 'retry-connection' }, deps)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('omits transfer projection for a permitted inspector without a completed transfer', async () => {
    mocks.authority.mockRejectedValue({ statusCode: 403 })
    mocks.session.mockResolvedValue({ identityId: current.identityId, accountId: current.accountId })
    mocks.inspection.mockResolvedValue({ tenantId: scope.tenantId, clientId: scope.clientId, workspaceId: current.workspaceId, canManagePublication: false })
    expect(await readCustomerManagedTransfer(token, siteId, deps)).toBeNull()
    expect(mocks.remote).not.toHaveBeenCalled()
  })
  it('still denies a revoked inspection session and foreign site', async () => {
    mocks.authority.mockRejectedValue({ statusCode: 403 })
    mocks.session.mockResolvedValue({ identityId: current.identityId, accountId: current.accountId })
    mocks.inspection.mockRejectedValue({ statusCode: 403 })
    await expect(readCustomerManagedTransfer(token, siteId, deps)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.remote).not.toHaveBeenCalled()
  })
})
