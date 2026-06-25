import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  headers?: Record<string, string>
}

const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockCreateWorkEventSource = vi.fn()
const mockRunObservePass = vi.fn()
const mockUpsertMemory = vi.fn()
const mockListRecentMemories = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: <T>(fn: T) => fn,
  getHeader: (event: TestEvent, key: string) => event.headers?.[key.toLowerCase()] ?? event.headers?.[key],
  createError: (opts: { statusCode: number, statusMessage: string }) => Object.assign(new Error(opts.statusMessage), opts),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('~~/server/utils/ai/observe/source', () => ({
  createWorkEventSource: (...args: unknown[]) => mockCreateWorkEventSource(...args),
}))

vi.mock('~~/server/utils/ai/observe/run', () => ({
  ROUTINE_LOOKBACK_DAYS: 90,
  runObservePass: (...args: unknown[]) => mockRunObservePass(...args),
}))

vi.mock('~~/server/utils/ai/memory/store', () => ({
  upsertMemory: (...args: unknown[]) => mockUpsertMemory(...args),
  listRecentMemories: (...args: unknown[]) => mockListRecentMemories(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    REASONING_20B: 'openai/gpt-oss-20b',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { default: handler } = await import('../../../server/api/cron/observe-and-learn.post')

describe('POST /api/cron/observe-and-learn telemetry', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test'
    process.env.AI_OBSERVE_ENABLED = 'true'
    mockQueryRows.mockReset().mockResolvedValue([])
    mockQueryOne.mockReset().mockResolvedValue(null)
    mockExecute.mockReset().mockResolvedValue(1)
    mockCreateWorkEventSource.mockReset().mockReturnValue({ read: vi.fn() })
    mockUpsertMemory.mockReset().mockResolvedValue('memory-1')
    mockListRecentMemories.mockReset().mockResolvedValue([])
    mockGenerateGroqInsight.mockReset().mockResolvedValue('[]')
    mockRunObservePass.mockReset().mockImplementation(async (deps) => {
      await deps.complete('Distill this observed routine prompt.')
      return {
        users: 1,
        events: 4,
        routines: 1,
        memories: 0,
        perUser: [{ userId: 'user-1', events: 4, routines: 1, memories: 0 }],
      }
    })
  })

  it('records Model Ops metadata for observe-and-learn routine distillation', async () => {
    const result = await handler({ headers: { 'x-cron-secret': 'test' } } satisfies TestEvent)

    expect(result).toEqual({
      ok: true,
      users: 1,
      events: 4,
      routines: 1,
      memories: 0,
      perUser: [{ userId: 'user-1', events: 4, routines: 1, memories: 0 }],
    })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith('Distill this observed routine prompt.', expect.objectContaining({
      model: 'openai/gpt-oss-20b',
      featureKey: 'observe_and_learn_distillation',
      requestId: 'cron-observe-and-learn',
      metadata: {
        route: '/api/cron/observe-and-learn',
        lookbackDays: 90,
        promptChars: 37,
      },
    }))
  })
})
