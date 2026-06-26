import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: any) => Record<string, unknown>
  requireAuth: (event: any) => Promise<unknown>
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.requireAuth = event => mockRequireAuth(event)

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockSetCacheHeaders = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/cacheHeaders', () => ({
  setCacheHeaders: (...args: unknown[]) => mockSetCacheHeaders(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_8B: 'llama-3.1-8b-instant',
  },
}))

vi.mock('~~/server/utils/ai/resolvedGroq', () => ({
  generateModelRoutedGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { default: handler } = await import('../../../../server/api/notifications/digest.get')

describe('GET /api/notifications/digest narrative telemetry', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset().mockResolvedValue({ id: 'user-1', timezone: 'Australia/Melbourne' })
    mockQueryRows.mockReset().mockResolvedValue([
      {
        board_id: 'board-1',
        board_name: 'Creative',
        reason: 'assigned',
        task_id: 'task-1',
        task_title: 'Design ads',
        count: 2,
      },
      {
        board_id: 'board-1',
        board_name: 'Creative',
        reason: 'mentioned',
        task_id: 'task-2',
        task_title: 'Review copy',
        count: 1,
      },
    ])
    mockSetCacheHeaders.mockReset()
    mockGenerateGroqInsight.mockReset().mockResolvedValue('Creative has three updates needing your attention.')
  })

  it('records explicit Model Ops metadata for board narratives', async () => {
    const result = await handler({ query: { range: 'week', narrative: '1' } } as any)

    expect(result.range).toBe('week')
    expect(result.boards[0].narrative).toBe('Creative has three updates needing your attention.')
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Creative'), expect.objectContaining({
      defaultModelId: 'llama-3.1-8b-instant',
      featureKey: 'notification_digest_narrative',
      userId: 'user-1',
      requestId: 'week:board-1',
      metadata: {
        route: '/api/notifications/digest',
        range: 'week',
        boardId: 'board-1',
        topItemCount: 2,
        mentionedCount: 1,
        assignedCount: 2,
        watchingCount: 0,
        directCount: 0,
      },
    }))
  })
})
