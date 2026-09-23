import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageStudioStagingAddress, type PageStudioStagingState } from '~~/shared/pageStudio/staging'
import { dispatchCheckpointStaging, CHECKPOINT_STAGING_RPC_TIMEOUT_MS } from '~~/server/utils/pageStudio/checkpointStagingDispatcher'
import type { CheckpointStagingClaim } from '~~/server/utils/pageStudio/checkpointStagingOutbox'

const mocks = vi.hoisted(() => ({ claim: vi.fn(), settle: vi.fn() }))
vi.mock('~~/server/utils/pageStudio/checkpointStagingOutbox', async importOriginal => ({
  ...await importOriginal<object>(), claimCheckpointStaging: mocks.claim, settleCheckpointStaging: mocks.settle
}))
const siteId = '10000000-0000-4000-8000-000000000001'
const claim: CheckpointStagingClaim = { request: {
  scope: { tenantId: 'tenant', clientId: '10000000-0000-4000-8000-000000000002', siteId },
  auditId: '10000000-0000-4000-8000-000000000003', checkpointId: 'checkpoint_saved', digest: 'a'.repeat(64), expectedEnvironment: 'staging'
}, token: '10000000-0000-4000-8000-000000000004', attempt: 1 }
const state = (status: PageStudioStagingState['status'] = 'ready'): PageStudioStagingState => ({
  siteId, ...pageStudioStagingAddress(siteId), status, canManage: true, currentDigest: claim.request.digest, failure: null,
  active: ['ready', 'update_failed'].includes(status) ? { id: '10000000-0000-4000-8000-000000000005', checkpointId: claim.request.checkpointId, digest: claim.request.digest, deployedAt: '2026-09-23T00:00:00.000Z' } : null
})
const success = (value = state()) => ({ ok: true, request: claim.request, value })
describe('durable checkpoint staging dispatcher', () => {
  let checkpointStaging: ReturnType<typeof vi.fn>
  let env: Record<string, unknown>
  let transactions: number
  let inTransaction: boolean
  const database = { query: vi.fn() }
  const transaction = async <T>(work: (db: typeof database) => Promise<T>) => {
    transactions++
    inTransaction = true
    try {
      return await work(database)
    } finally { inTransaction = false }
  }
  beforeEach(() => {
    vi.clearAllMocks()
    transactions = 0
    inTransaction = false
    mocks.claim.mockResolvedValue({ claims: [claim], exhausted: 0 })
    mocks.settle.mockResolvedValue(true)
    checkpointStaging = vi.fn(async () => {
      expect(inTransaction).toBe(false)
      return success()
    })
    env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging', PAGE_STUDIO_MANAGEMENT: { checkpointStaging } }
  })
  afterEach(() => vi.useRealTimers())
  const run = () => dispatchCheckpointStaging(env, { transaction })
  it('commits a bounded claim before private RPC and settles in a separate transaction', async () => {
    expect(await run()).toEqual({ claimed: 1, completed: 1, stopped: 0, rescheduled: 0, unsettled: 0, exhausted: 0 })
    expect(mocks.claim).toHaveBeenCalledWith(database, 'staging', 3)
    expect(checkpointStaging).toHaveBeenCalledExactlyOnceWith(claim.request)
    expect(mocks.settle).toHaveBeenCalledWith(database, claim, 'READY')
    expect(transactions).toBe(2)
  })
  it.each(['not_published', 'building', 'provisioning'] as const)('retains %s responses for reconciliation instead of completing them', async (status) => {
    checkpointStaging.mockResolvedValue(success(state(status)))
    expect(await run()).toMatchObject({ completed: 0, rescheduled: 1 })
    expect(mocks.settle).toHaveBeenCalledWith(database, claim, 'PENDING')
  })
  it.each(['failed', 'update_failed', 'suspended'] as const)('stops %s without creating a fresh update request', async (status) => {
    checkpointStaging.mockResolvedValue(success(state(status)))
    expect(await run()).toMatchObject({ stopped: 1, completed: 0 })
    expect(mocks.settle).toHaveBeenCalledWith(database, claim, status === 'suspended' ? 'SUSPENDED' : 'FAILED')
    expect(checkpointStaging).toHaveBeenCalledOnce()
  })
  it('does not mark a different retained snapshot as the requested checkpoint', async () => {
    const value = state()
    value.active!.checkpointId = 'older_checkpoint'
    checkpointStaging.mockResolvedValue(success(value))
    expect(await run()).toMatchObject({ stopped: 1, completed: 0 })
    expect(mocks.settle).toHaveBeenCalledWith(database, claim, 'STAGING_CHANGED')
  })
  it.each([['STAGING_INVALID', 400, false], ['STAGING_ACCESS_DENIED', 403, false], ['STAGING_CHANGED', 409, false], ['STAGING_BUILD_LIMIT', 429, false], ['STAGING_BUSY', 409, true], ['STAGING_SERVICE_UNAVAILABLE', 503, true]] as const)('handles %s without replacing its immutable identity', async (code, statusCode, retry) => {
    checkpointStaging.mockResolvedValue({ ok: false, error: { code, statusCode } })
    expect(await run()).toMatchObject({ stopped: retry ? 0 : 1, rescheduled: retry ? 1 : 0 })
    expect(mocks.settle).toHaveBeenCalledWith(database, claim, code)
  })
  it('treats an unknown or malformed reply as uncertain without leaking content', async () => {
    checkpointStaging.mockRejectedValue(new Error('private provider body'))
    const result = await run()
    expect(result).toMatchObject({ rescheduled: 1 })
    expect(JSON.stringify(result)).not.toContain('private')
    expect(mocks.settle).toHaveBeenCalledWith(database, claim, 'STAGING_SERVICE_UNAVAILABLE')
  })
  it('keeps an unacknowledged lease recoverable after a settlement failure', async () => {
    mocks.settle.mockRejectedValue(new Error('private database details'))
    expect(await run()).toMatchObject({ unsettled: 1, completed: 0 })
    expect(checkpointStaging).toHaveBeenCalledOnce()
  })
  it('does not report completion when its acknowledgement is expired or superseded', async () => {
    mocks.settle.mockResolvedValue(false)
    expect(await run()).toMatchObject({ unsettled: 1, completed: 0 })
  })
  it('does not send a request after an uncertain claim commit', async () => {
    await expect(dispatchCheckpointStaging(env, { transaction: async (work) => {
      await work(database)
      throw new Error('ambiguous commit')
    } })).rejects.toThrow()
    expect(checkpointStaging).not.toHaveBeenCalled()
  })
  it('starts all three bounded RPCs before waiting so later claims do not expire in a serial queue', async () => {
    vi.useFakeTimers()
    mocks.claim.mockResolvedValue({ claims: [claim, { ...claim, token: crypto.randomUUID() }, { ...claim, token: crypto.randomUUID() }], exhausted: 0 })
    checkpointStaging.mockImplementation(() => new Promise(() => {}))
    const pending = run()
    await vi.advanceTimersByTimeAsync(1)
    expect(checkpointStaging).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(CHECKPOINT_STAGING_RPC_TIMEOUT_MS)
    expect(await pending).toMatchObject({ claimed: 3, rescheduled: 3 })
  })
  it('ignores a late success after timing out and settling once', async () => {
    vi.useFakeTimers()
    let resolve!: (value: unknown) => void
    checkpointStaging.mockImplementation(() => new Promise((r) => {
      resolve = r
    }))
    const pending = run()
    await vi.advanceTimersByTimeAsync(CHECKPOINT_STAGING_RPC_TIMEOUT_MS + 1)
    expect(await pending).toMatchObject({ rescheduled: 1 })
    resolve(success())
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.settle).toHaveBeenCalledOnce()
  })
  it('stops a final uncertain attempt and reports already exhausted work without RPC', async () => {
    mocks.claim.mockResolvedValue({ claims: [{ ...claim, attempt: 8 }], exhausted: 1 })
    checkpointStaging.mockRejectedValue(new Error('lost response'))
    expect(await run()).toMatchObject({ stopped: 1, rescheduled: 0, exhausted: 1 })
  })
  it.each([{}, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'foreign' }, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }])('rejects missing or mismatched service configuration before claims', async (badEnv) => {
    await expect(dispatchCheckpointStaging(badEnv, { transaction })).rejects.toMatchObject({ code: 'STAGING_SERVICE_UNAVAILABLE' })
    expect(mocks.claim).not.toHaveBeenCalled()
  })
})
