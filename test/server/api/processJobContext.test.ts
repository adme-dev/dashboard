import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockProcessJob = vi.fn()
const mockStartJobExecution = vi.fn()
const mockFinishJobExecution = vi.fn()

interface TestEvent {
  headers?: Record<string, string>
  context?: Record<string, unknown>
  body?: unknown
}

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getHeader: (event: TestEvent, name: string) => event.headers?.[name.toLowerCase()],
  readBody: async (event: TestEvent) => event.body,
  createError: (input: unknown) => input
}))

vi.mock('~~/server/utils/queueConsumer', () => ({
  processJob: (...args: unknown[]) => mockProcessJob(...args)
}))

vi.mock('~~/server/utils/jobExecutionLedger', () => ({
  startJobExecution: (...args: unknown[]) => mockStartJobExecution(...args),
  finishJobExecution: (...args: unknown[]) => mockFinishJobExecution(...args)
}))

const { default: handler } = await import('~~/server/api/internal/process-job.post')

describe('internal queue bridge context', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret'
    mockProcessJob.mockReset().mockResolvedValue(undefined)
    mockStartJobExecution.mockReset().mockResolvedValue({ jobId: 'ledger-job', attempt: 1 })
    mockFinishJobExecution.mockReset().mockResolvedValue(undefined)
  })

  it('passes the actual H3 event to binding-aware processors', async () => {
    const event = {
      headers: { 'x-cron-secret': 'test-cron-secret' },
      context: { cloudflare: { env: { KNOWLEDGE_VECTORIZE: { name: 'dedicated-index' } } } },
      body: {
        jobId: '70000000-0000-4000-8000-000000000007',
        type: 'knowledge.index',
        payload: {
          submissionId: '10000000-0000-4000-8000-000000000001',
          expectedVersionKey: 'sha256:abc'
        },
        enqueuedAt: '2026-08-04T00:00:00.000Z'
      }
    }

    await handler(event as never)

    expect(mockProcessJob).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.index' }), { event })
    expect(mockFinishJobExecution).toHaveBeenCalledWith(expect.anything(), 'succeeded', expect.any(Number))
  })
})
