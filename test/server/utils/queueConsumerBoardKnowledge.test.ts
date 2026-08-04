import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockProcessExtraction = vi.fn()
const mockProcessIndexing = vi.fn()
const mockRecordJobQueued = vi.fn()
const mockStartJobExecution = vi.fn()
const mockFinishJobExecution = vi.fn()

vi.mock('~~/server/utils/boardKnowledge/processExtraction', () => ({
  processBoardKnowledgeExtraction: (...args: unknown[]) => mockProcessExtraction(...args)
}))

vi.mock('~~/server/utils/boardKnowledge/processIndexing', () => ({
  processBoardKnowledgeIndexing: (...args: unknown[]) => mockProcessIndexing(...args)
}))

vi.mock('~~/server/utils/jobExecutionLedger', () => ({
  recordJobQueued: (...args: unknown[]) => mockRecordJobQueued(...args),
  markJobDispatchFailed: vi.fn(),
  startJobExecution: (...args: unknown[]) => mockStartJobExecution(...args),
  finishJobExecution: (...args: unknown[]) => mockFinishJobExecution(...args)
}))

const { processJob } = await import('~~/server/utils/queueConsumer')
const { enqueue } = await import('~~/server/utils/queue')

describe('Board Knowledge queue routing', () => {
  beforeEach(() => {
    mockProcessExtraction.mockReset().mockResolvedValue({ status: 'ready' })
    mockProcessIndexing.mockReset().mockResolvedValue({ status: 'indexed' })
    mockRecordJobQueued.mockReset().mockResolvedValue(undefined)
    mockStartJobExecution.mockReset().mockResolvedValue({ jobId: 'ledger-job', attempt: 1 })
    mockFinishJobExecution.mockReset().mockResolvedValue(undefined)
  })

  it('routes identifier-only extraction work with the request context', async () => {
    const event = { context: { cloudflare: { env: { MEDIA_BUCKET: {} } } } } as never
    const payload = {
      submissionId: '10000000-0000-4000-8000-000000000001',
      expectedVersionKey: 'sha256:abc'
    }

    await processJob({ type: 'knowledge.extract', payload, enqueuedAt: '2026-08-04T00:00:00.000Z' }, { event })

    expect(mockProcessExtraction).toHaveBeenCalledWith({ event }, payload)
    expect(JSON.stringify(payload)).not.toContain('bytes')
    expect(JSON.stringify(payload)).not.toContain('content')
  })

  it('routes identifier-only indexing work with the request context', async () => {
    const event = { context: { cloudflare: { env: { KNOWLEDGE_VECTORIZE: {} } } } } as never
    const payload = {
      submissionId: '10000000-0000-4000-8000-000000000001',
      expectedVersionKey: 'sha256:abc'
    }

    await processJob({ type: 'knowledge.index', payload, enqueuedAt: '2026-08-04T00:00:00.000Z' }, { event })

    expect(mockProcessIndexing).toHaveBeenCalledWith({ event }, payload)
  })

  it('rejects document bytes or extracted content in a knowledge queue payload', async () => {
    await expect(processJob({
      type: 'knowledge.extract',
      payload: {
        submissionId: '10000000-0000-4000-8000-000000000001',
        expectedVersionKey: 'sha256:abc',
        content: 'must not enter the queue'
      },
      enqueuedAt: '2026-08-04T00:00:00.000Z'
    })).rejects.toThrow('invalid_board_knowledge_queue_payload')

    expect(mockProcessExtraction).not.toHaveBeenCalled()
  })

  it('uses the originating request event for the local inline fallback', async () => {
    const event = { context: { cloudflare: { env: {} } } } as never
    const payload = {
      submissionId: '10000000-0000-4000-8000-000000000001',
      expectedVersionKey: 'sha256:abc'
    }

    await expect(enqueue(event, 'knowledge.extract', payload)).resolves.toBe(false)
    await vi.waitFor(() => expect(mockProcessExtraction).toHaveBeenCalledWith({ event }, payload))
    expect(mockRecordJobQueued).toHaveBeenCalledWith(expect.objectContaining({ type: 'knowledge.extract' }), 'inline')
  })

  it('blocks unsafe document payloads before they can be sent to Cloudflare Queues', async () => {
    const send = vi.fn()
    const event = { context: { cloudflare: { env: { JOBS_QUEUE: { send } } } } } as never

    await expect(enqueue(event, 'knowledge.extract', {
      submissionId: '10000000-0000-4000-8000-000000000001',
      expectedVersionKey: 'sha256:abc',
      bytes: 'must never leave the producer'
    })).rejects.toThrow('invalid_board_knowledge_queue_payload')

    expect(send).not.toHaveBeenCalled()
    expect(mockRecordJobQueued).not.toHaveBeenCalled()
  })
})
