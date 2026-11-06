import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeStoryboardPlan, registerGodModeStoryboardPlanningFamily } from '~~/server/utils/video-storyboard/planningGodMode'

const mocks = vi.hoisted(() => ({ execute: vi.fn(), prepare: vi.fn(), register: vi.fn(), replay: false, id: 'receipt' }))
vi.mock('~~/server/utils/godMode/externalLedgerCoordinator', () => ({ executeGodModeExternalMutation: mocks.execute, prepareGodModeExternalMutation: mocks.prepare }))
vi.mock('~~/server/utils/godMode/featureGate', () => ({ registerGodModeMutationFamily: mocks.register }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.replay = false
  mocks.id = 'receipt'
  mocks.execute.mockImplementation(async (_event, _family, _count, work) => work({ markDispatched: vi.fn(), replay: mocks.replay, replayResult: { id: mocks.id } }))
})
describe('planning owner receipts', () => {
  it('registers only the planning POST', () => {
    registerGodModeStoryboardPlanningFamily()
    const family = mocks.register.mock.calls[0][0]
    expect(family.method).toBe('POST')
    expect(family.matchesPath('/api/agency/video/projects/00000000-0000-4000-8000-000000000002/storyboard/plan')).toBe(true)
    expect(family.matchesPath('/api/agency/video/projects/00000000-0000-4000-8000-000000000002/storyboard/apply')).toBe(false)
  })
  it('reruns the canonical authorization/replay lookup and compares receipt IDs', async () => {
    mocks.replay = true
    const work = vi.fn().mockResolvedValue({ id: 'receipt', plan: { private: 'content' } })
    expect(await executeStoryboardPlan({ context: {} } as never, work)).toMatchObject({ id: 'receipt' })
    expect(work).toHaveBeenCalledTimes(1)
    mocks.id = 'wrong'
    await expect(executeStoryboardPlan({ context: {} } as never, work)).rejects.toMatchObject({ statusCode: 409 })
    work.mockRejectedValue({ statusCode: 403 })
    await expect(executeStoryboardPlan({ context: {} } as never, work)).rejects.toMatchObject({ statusCode: 403 })
  })
})
