import { describe, expect, it, vi } from 'vitest'
import { canRetryBannerJob, dispatchBannerRenderJob, RECORD_BANNER_DISPATCH_FAILURE_SQL, RESERVE_BANNER_RETRY_SQL } from '~~/server/utils/banner/renderDispatch'

describe('banner dispatch recovery', () => {
  it('persists definitive pre-dispatch failures without sending', async () => {
    const recordFailure = vi.fn(), send = vi.fn()
    await expect(dispatchBannerRenderJob('job', { beforeDispatch: async () => {
      throw new Error('checkpoint')
    }, send, recordFailure })).rejects.toThrow('checkpoint')
    expect(send).not.toHaveBeenCalled()
    expect(recordFailure).toHaveBeenCalledWith('job', false, expect.stringContaining('not submitted'))
  })
  it('records a send rejection as uncertain and never sends a replacement', async () => {
    const recordFailure = vi.fn(), send = vi.fn().mockRejectedValue(new Error('lost response'))
    await expect(dispatchBannerRenderJob('job', { beforeDispatch: async () => {}, send, recordFailure })).rejects.toThrow('lost response')
    expect(send).toHaveBeenCalledExactlyOnceWith({ jobId: 'job' })
    expect(recordFailure).toHaveBeenCalledWith('job', true, expect.stringContaining('may still render'))
    expect(RECORD_BANNER_DISPATCH_FAILURE_SQL).toContain('WHERE id = $1 AND status = \'queued\'')
  })
  it('permits failed and stale queued jobs, never running/completed or recently queued jobs', () => {
    const now = Date.parse('2026-10-04T00:30:00Z')
    for (const status of ['rendering', 'done']) expect(canRetryBannerJob({ status, updated_at: '2026-10-04T00:00:00Z' }, now)).toBe(false)
    expect(canRetryBannerJob({ status: 'failed' }, now)).toBe(true)
    expect(canRetryBannerJob({ status: 'queued', updated_at: '2026-10-04T00:00:00Z' }, now)).toBe(true)
    expect(canRetryBannerJob({ status: 'queued', updated_at: '2026-10-04T00:29:00Z' }, now)).toBe(false)
    expect(canRetryBannerJob({ status: 'queued', updated_at: 'invalid' }, now)).toBe(false)
    expect(RESERVE_BANNER_RETRY_SQL).toContain('status = \'failed\' OR (status = \'queued\'')
  })
})
