import { beforeEach, describe, expect, it, vi } from 'vitest'

const order: string[] = []
const failStale = vi.fn()
const getJob = vi.fn()

vi.mock('~~/workers/asset-intelligence/src/db', () => ({
  failStaleAssetIntelligenceJobs: (...args: unknown[]) => failStale(...args),
  getAssetIntelligenceJob: (...args: unknown[]) => getJob(...args),
  markAssetIntelligenceJobRunning: vi.fn(),
  markAssetIntelligenceJobFailed: vi.fn(),
  markAssetIntelligenceJobSucceeded: vi.fn(),
  createDerivative: vi.fn(),
  dbRecordAiInvocation: vi.fn(),
  getVideoAssetPictureKeys: vi.fn(),
  getVideoAssetR2Key: vi.fn()
}))

const worker = (await import('~~/workers/asset-intelligence/src/index')).default

function message(jobId: string) {
  return { body: { jobId, projectId: 'project-1', sourceAssetId: 'asset-1' }, ack: vi.fn(), retry: vi.fn() }
}
const env = { HYPERDRIVE: { connectionString: 'postgres://hyperdrive.local/db' }, MEDIA_BUCKET: {} } as any
const JOB_ID = '11111111-1111-4111-8111-111111111111'

describe('asset intelligence queue handler', () => {
  beforeEach(() => {
    order.length = 0
    failStale.mockReset().mockImplementation(async () => { order.push('sweep'); return 0 })
    getJob.mockReset().mockImplementation(async () => { order.push('job'); return null })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('closes stranded jobs before it starts on the delivery', async () => {
    const msg = message(JOB_ID)
    await worker.queue({ messages: [msg] } as any, env)
    expect(order).toEqual(['sweep', 'job'])
    expect(msg.ack).toHaveBeenCalledTimes(1)
  })

  it('still processes the delivery when the stale-job sweep fails', async () => {
    failStale.mockRejectedValue(new Error('database unavailable'))
    const msg = message(JOB_ID)
    await worker.queue({ messages: [msg] } as any, env)
    expect(getJob).toHaveBeenCalledWith(JOB_ID)
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
  })

  it('asks the queue to retry a message whose job could not be read, and carries on with the next', async () => {
    getJob.mockRejectedValueOnce(new Error('connect timeout')).mockResolvedValueOnce(null)
    const first = message(JOB_ID)
    const second = message('22222222-2222-4222-8222-222222222222')
    await worker.queue({ messages: [first, second] } as any, env)
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 30 })
    expect(first.ack).not.toHaveBeenCalled()
    expect(second.ack).toHaveBeenCalledTimes(1)
  })
})
