import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ pipeline: vi.fn() }))
vi.mock('~~/server/utils/bannerDissectorPipeline', () => ({ runDissectionPipeline: m.pipeline }))
const { processJob } = await import('../../../server/utils/queueConsumer')
beforeEach(() => {
  vi.resetAllMocks()
  m.pipeline.mockResolvedValue({ status: 'review_ready' })
})
const deliver = (payload: Record<string, unknown>) => processJob({ type: 'dissect.analyze', payload, enqueuedAt: '2026-10-27T00:00:00.000Z' })
describe('Dissection queue generation and failure contract', () => {
  it('passes the captured generation and preserves null queue context', async () => {
    await deliver({ jobId: 'job', attemptId: 'generation' })
    expect(m.pipeline).toHaveBeenCalledWith(null, 'job', { attemptId: 'generation' })
  })
  it('ignores old unbound deliveries without claiming any newer attempt', async () => {
    await deliver({ jobId: 'job' })
    expect(m.pipeline).not.toHaveBeenCalled()
  })
  it('keeps failed jobs failed in the delivery ledger without implicitly retrying providers', async () => {
    m.pipeline.mockResolvedValue({ status: 'failed' })
    await expect(deliver({ jobId: 'job', attemptId: 'generation' })).rejects.toThrow(/explicit retry/)
    m.pipeline.mockRejectedValue(new Error('content-free pipeline failure'))
    await expect(deliver({ jobId: 'job', attemptId: 'generation' })).rejects.toThrow('content-free pipeline failure')
  })
})
