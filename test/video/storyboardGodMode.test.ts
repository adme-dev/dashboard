import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeStoryboardReferenceWrite, registerGodModeStoryboardMutationFamilies, isStoryboardReferenceWritePath } from '~~/server/utils/video-storyboard/godMode'

const mocks = vi.hoisted(() => ({ register: vi.fn(), prepare: vi.fn(), execute: vi.fn(), transaction: vi.fn(), replayId: '' }))
vi.mock('~~/server/utils/db', () => ({ transaction: mocks.transaction }))
vi.mock('~~/server/utils/godMode/audit', () => ({ appendGodModeAuditEvent: vi.fn() }))
vi.mock('~~/server/utils/godMode/featureGate', () => ({ registerGodModeMutationFamily: mocks.register }))
vi.mock('~~/server/utils/godMode/transactionCoordinator', () => ({
  defineGodModeTransactionOperation: (value: object) => value,
  prepareGodModeTransactionMutation: mocks.prepare,
  executeGodModeTransactionMutation: mocks.execute
}))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), getRequestURL: () => new URL('https://example.test/api/reference') }))
const db = { query: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(fn => fn(db))
  mocks.execute.mockImplementation((_event, _op, _transaction, _mutate, replay) => replay(db, mocks.replayId))
})
describe('storyboard owner coordination', () => {
  it('registers only the implemented PUT reference route', () => {
    registerGodModeStoryboardMutationFamilies()
    const family = mocks.register.mock.calls[0][0]
    expect(family.method).toBe('PUT')
    expect(isStoryboardReferenceWritePath('/api/agency/video/projects/00000000-0000-4000-8000-000000000002/storyboard/references')).toBe(true)
    expect(isStoryboardReferenceWritePath('/api/agency/video/projects/00000000-0000-4000-8000-000000000002/storyboard/apply')).toBe(false)
  })
  it('registers the apply POST family and replays the canonical application receipt', async () => {
    registerGodModeStoryboardMutationFamilies()
    const family = mocks.register.mock.calls.map(([value]) => value).find(value => value.family === 'video-storyboard-apply')
    expect(family.method).toBe('POST')
    expect(family.matchesPath('/api/agency/video/projects/00000000-0000-4000-8000-000000000002/storyboard/apply')).toBe(true)
    expect(family.matchesPath('/api/agency/video/projects/00000000-0000-4000-8000-000000000002/storyboard/applications/operation')).toBe(false)
    const event = { context: {} }
    await family.prepare(event)
    const receipt = { id: 'application', checkpointTimelineId: 'prior', after: { timelineId: 'new', editRevision: 1 } }
    mocks.replayId = receipt.id
    const canonical = vi.fn().mockResolvedValue(receipt)
    expect(await executeStoryboardReferenceWrite(event as never, canonical)).toEqual(receipt)
    expect(canonical).toHaveBeenCalledWith(db)
  })
  it('runs ordinary staff through the canonical transaction core', async () => {
    const mutate = vi.fn().mockResolvedValue({ id: 'receipt' })
    await executeStoryboardReferenceWrite({ context: {} } as never, mutate)
    expect(mutate).toHaveBeenCalledWith(db)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('reauthorizes/replays through the canonical core and checks the owner receipt', async () => {
    registerGodModeStoryboardMutationFamilies()
    const event = { context: {} }
    await mocks.register.mock.calls[0][0].prepare(event)
    const mutate = vi.fn().mockResolvedValue({ id: 'receipt' })
    mocks.replayId = 'receipt'
    expect(await executeStoryboardReferenceWrite(event as never, mutate)).toEqual({ id: 'receipt' })
    mocks.replayId = 'different'
    await expect(executeStoryboardReferenceWrite(event as never, mutate)).rejects.toMatchObject({ statusCode: 409 })
    mutate.mockRejectedValue({ statusCode: 403 })
    await expect(executeStoryboardReferenceWrite(event as never, mutate)).rejects.toMatchObject({ statusCode: 403 })
  })
})
