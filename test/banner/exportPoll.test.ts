import { afterEach, describe, it, expect, vi } from 'vitest'
import { createExportJobPoller, exportFormatLabel, summarizeExportJobs } from '~~/app/utils/bannerExportPoll'

const j = (status: string, url?: string) => ({ jobId: 'x', formatKey: 'a', status, url: url ?? null, fileSize: null, error: null })
afterEach(() => vi.useRealTimers())

describe('durable export polling', () => {
  it('reports actual stages and settlement counts without invented progress', () => {
    expect(summarizeExportJobs([j('done', 'u'), j('rendering'), j('queued'), j('failed')])).toEqual({ total: 4, done: 1, failed: 1, pending: 2, queued: 1, rendering: 1, finished: false, urls: ['u'] })
    expect(summarizeExportJobs([]).finished).toBe(true)
    expect(exportFormatLabel('ig_port')).toBe('Portrait feed')
  })
  it('continues beyond five minutes and stops only when jobs settle', async () => {
    vi.useFakeTimers()
    const fetchJobs = vi.fn().mockResolvedValue([j('rendering')])
    const onJobs = vi.fn()
    const poller = createExportJobPoller({ fetchJobs, onJobs, onError: vi.fn() })
    await poller.start()
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000)
    expect(fetchJobs.mock.calls.length).toBeGreaterThan(100)
    fetchJobs.mockResolvedValue([j('done', 'video')])
    await vi.advanceTimersByTimeAsync(3000)
    expect(onJobs).toHaveBeenLastCalledWith([j('done', 'video')])
    const count = fetchJobs.mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchJobs).toHaveBeenCalledTimes(count)
    poller.stop()
  })
  it('retries failed reads without replacing jobs, and recovers on reopening', async () => {
    vi.useFakeTimers()
    const fetchJobs = vi.fn().mockResolvedValueOnce([j('queued')]).mockRejectedValueOnce(new Error('offline')).mockResolvedValue([j('done', 'video')])
    const onJobs = vi.fn(), onError = vi.fn()
    const poller = createExportJobPoller({ fetchJobs, onJobs, onError })
    await poller.start()
    await vi.advanceTimersByTimeAsync(3000)
    expect(onJobs).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledOnce()
    poller.stop()
    await vi.advanceTimersByTimeAsync(600000)
    expect(fetchJobs).toHaveBeenCalledTimes(2)
    await poller.start()
    expect(onJobs).toHaveBeenLastCalledWith([j('done', 'video')])
    poller.stop()
  })
  it('ignores an in-flight response after closing or switching projects', async () => {
    let resolve!: (value: ReturnType<typeof j>[]) => void
    const onJobs = vi.fn()
    const poller = createExportJobPoller({ fetchJobs: () => new Promise((r) => {
      resolve = r
    }), onJobs, onError: vi.fn() })
    const pending = poller.start()
    poller.stop()
    resolve([j('done', 'old-project')])
    await pending
    expect(onJobs).not.toHaveBeenCalled()
  })
})
