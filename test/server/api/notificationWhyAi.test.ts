import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: any, name: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.createError = (opts) => Object.assign(new Error(opts.statusMessage), opts)

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockEnforceRateLimit = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('~~/server/utils/rateLimit', () => ({
  enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_8B: 'llama-3.1-8b-instant',
  },
}))

vi.mock('~~/server/utils/ai/resolvedGroq', () => ({
  generateModelRoutedGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { default: handler } = await import('../../../../server/api/notifications/[id]/why.get')

describe('GET /api/notifications/:id/why telemetry', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset().mockResolvedValue({ id: 'user-1' })
    mockQueryOne.mockReset().mockResolvedValue({
      id: 'notification-1',
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: 'Jane assigned you to Design ads',
      reason: 'assigned',
      metadata: {
        boardName: 'Creative',
        taskTitle: 'Design ads',
        changes: { assignee: 'user-1' },
      },
    })
    mockExecute.mockReset().mockResolvedValue({ rowCount: 1 })
    mockEnforceRateLimit.mockReset().mockResolvedValue(undefined)
    mockGenerateGroqInsight.mockReset().mockResolvedValue('You were assigned to Design ads.')
  })

  it('records explicit Model Ops metadata for uncached AI explanations', async () => {
    const result = await handler({ params: { id: 'notification-1' } } as any)

    expect(result).toEqual({
      reason: 'You were assigned to Design ads.',
      generatedByAI: true,
      cached: false,
    })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('New Task Assigned'), expect.objectContaining({
      defaultModelId: 'llama-3.1-8b-instant',
      featureKey: 'notification_why_explanation',
      userId: 'user-1',
      requestId: 'notification-1',
      metadata: {
        route: '/api/notifications/:id/why',
        notificationId: 'notification-1',
        notificationType: 'task_assigned',
        reason: 'assigned',
        hasTitle: true,
        hasMessage: true,
        hasBoardName: true,
        hasTaskTitle: true,
        hasChanges: true,
      },
    }))
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE notifications SET metadata'),
      [expect.stringContaining('whyGeneratedByAI'), 'notification-1', 'user-1'],
    )
  })
})
