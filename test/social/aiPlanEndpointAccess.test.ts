import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  body?: unknown
}
type TestGlobal = typeof globalThis & {
  defineEventHandler: <T extends (...args: unknown[]) => unknown>(fn: T) => T
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

const g = globalThis as TestGlobal
g.defineEventHandler = fn => fn
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: { statusCode: number, statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireRole = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockGeneratePlan = vi.fn()

vi.mock('~~/server/utils/auth', () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a) }))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...a: unknown[]) => mockRequireSocialClientAccess(...a)
}))
vi.mock('~~/server/utils/socialPublishing/plannerGate', () => ({ isPlannerAiEnabled: () => true }))
vi.mock('~~/server/utils/socialPublishing/planGeneration', () => ({
  generateSocialPublishingPlanDrafts: (...a: unknown[]) => mockGeneratePlan(...a)
}))

const { default: handler } = await import('../../server/api/agency/social/publishing/ai/generate-plan.post')

function event(input: TestEvent) {
  return input as Parameters<typeof handler>[0]
}

describe('generate-plan endpoint client access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'U1' })
    mockRequireSocialClientAccess.mockResolvedValue({ id: 'U1' })
    mockGeneratePlan.mockResolvedValue([{ content: 'Draft', platforms: ['facebook'], platform_overrides: {}, hashtags: [], suggested_scheduled_at: null }])
  })

  it('requires clientId', async () => {
    await expect(handler(event({ body: { brief: 'Launch plan' } }))).rejects.toThrow('clientId required')
    expect(mockGeneratePlan).not.toHaveBeenCalled()
  })

  it('requires access to the requested client before generation', async () => {
    const routeEvent = event({ body: { clientId: 'C1', brief: 'Launch plan', platforms: ['facebook'] } })

    const res = await handler(routeEvent)

    expect(res.posts).toHaveLength(1)
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(routeEvent, 'C1')
    expect(mockGeneratePlan).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'C1',
      userId: 'U1',
      brief: 'Launch plan'
    }))
  })
})
