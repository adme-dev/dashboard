import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBannerDissectionJob } from '../../app/composables/useBannerDissectionJob'

const deferred = <T = unknown>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
afterEach(() => vi.useRealTimers())

describe('saved dissection job controls', () => {
  it('resumes a saved job on reopening and retains failure details', async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith('/history')
      ? { dissections: [{ jobId: 'old', status: 'failed' }] }
      : { jobId: 'old', status: 'failed', error: 'Provider unavailable' })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    expect(jobs.current.value?.error).toBe('Provider unavailable')
    jobs.suspend()
    expect(jobs.current.value?.status).toBe('failed')
    await jobs.resume()
    expect(jobs.current.value?.jobId).toBe('old')
    jobs.suspend()
  })

  it('persists cancellation and ignores a late complete poll', async () => {
    const poll = deferred()
    const cancel = deferred()
    const fetcher = vi.fn((url: string) => url.endsWith('/history')
      ? Promise.resolve({ dissections: [] })
      : url.endsWith('/cancel') ? cancel.promise : poll.promise)
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    const selecting = jobs.select('running')
    const cancelling = jobs.cancel()
    poll.resolve({ jobId: 'running', status: 'complete', layers: [{ extraction_status: 'extracted' }] })
    await selecting
    expect(jobs.importReady.value).toBe(false)
    cancel.resolve({ jobId: 'running', status: 'cancelled' })
    await cancelling
    expect(jobs.current.value?.status).toBe('cancelled')
    expect(fetcher).toHaveBeenCalledWith('/api/agency/banner-studio/dissect/running/cancel', { method: 'POST' })
    jobs.suspend()
  })

  it('never attaches an upload result to a reopened session or another job', async () => {
    const upload = deferred()
    const fetcher = vi.fn((url: string) => url.endsWith('/upload')
      ? upload.promise
      : Promise.resolve(url.endsWith('/history') ? { dissections: [] } : { jobId: 'other', status: 'failed' }))
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    const uploading = jobs.upload(new FormData())
    jobs.suspend()
    await jobs.resume()
    await jobs.select('other')
    upload.resolve({ jobId: 'late', status: 'queued' })
    await uploading
    expect(jobs.current.value?.jobId).toBe('other')
    jobs.suspend()
  })

  it('keeps failed/cancelled findings visible when an explicit retry fails', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'bad', status: 'failed' }] }
      if (url.endsWith('/process')) throw { data: { statusMessage: 'Retry budget exhausted' } }
      return { jobId: 'bad', status: 'failed', execution: { attemptId: 'first', attempt: 1, maxAttempts: 3 }, error: 'Original failure', warnings: ['Retained finding'] }
    })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    await jobs.retry()
    expect(jobs.current.value?.error).toBe('Original failure')
    expect(jobs.current.value?.warnings).toEqual(['Retained finding'])
    expect(jobs.error.value).toBe('Retry budget exhausted')
    expect(fetcher).toHaveBeenCalledWith('/api/agency/banner-studio/dissect/process', { method: 'POST', body: { jobId: 'bad', retry: true, expectedAttemptId: 'first' } })
    jobs.suspend()
  })

  it('does not overlap polls or let an earlier selected job replace the current one', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const fetcher = vi.fn((url: string) => url.endsWith('/history')
      ? Promise.resolve({ dissections: [] })
      : url.endsWith('/first') ? first.promise : Promise.resolve({ jobId: 'second', status: 'queued' }))
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    const selecting = jobs.select('first')
    await vi.advanceTimersByTimeAsync(6000)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/first'))).toHaveLength(1)
    await jobs.select('second')
    first.resolve({ jobId: 'first', status: 'complete' })
    await selecting
    expect(jobs.current.value?.jobId).toBe('second')
    await vi.advanceTimersByTimeAsync(2001)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/second'))).toHaveLength(2)
    jobs.suspend()
  })

  it('preserves findings but blocks a cached complete result when reopening cannot refresh it', async () => {
    let unavailable = false
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'saved', status: 'complete' }] }
      if (unavailable) throw new Error('Network unavailable')
      return { resultId: 'a'.repeat(64), jobId: 'saved', status: 'complete', warnings: ['Review retained'], layers: [{ extraction_status: 'extracted' }], tokens: {} }
    })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    expect(jobs.importReady.value).toBe(true)
    jobs.suspend()
    unavailable = true
    await jobs.resume()
    expect(jobs.current.value?.warnings).toEqual(['Review retained'])
    expect(jobs.importReady.value).toBe(false)
    jobs.suspend()
  })

  it('keeps import blocked after an unconfirmed cancellation and stale complete refresh', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'saved', status: 'complete' }] }
      if (url.endsWith('/cancel')) throw new Error('Response lost')
      return { resultId: 'a'.repeat(64), jobId: 'saved', status: 'complete', layers: [{ extraction_status: 'extracted' }], tokens: {} }
    })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    await jobs.cancel()
    expect(jobs.importReady.value).toBe(false)
    expect(jobs.error.value).toContain('Cancellation was not confirmed')
    jobs.suspend()
    await jobs.resume()
    expect(jobs.importReady.value).toBe(false)
    expect(jobs.cancellationRequested.value).toBe(true)
    jobs.suspend()
  })

  it('polls an accepted queued retry and permits cancellation without reopening', async () => {
    vi.useFakeTimers()
    let status = 'failed'
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'saved', status }] }
      if (url.endsWith('/process')) status = 'queued'
      if (url.endsWith('/cancel')) status = 'cancelled'
      return { jobId: 'saved', status, execution: { attempt: status === 'failed' ? 1 : 2, maxAttempts: 3, attemptId: status === 'failed' ? 'old' : 'new' } }
    })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    await jobs.retry()
    expect(jobs.busy.value).toBe('')
    expect(jobs.canCancel.value).toBe(true)
    expect(jobs.canRetry.value).toBe(false)
    status = 'analyzing'
    await vi.advanceTimersByTimeAsync(2001)
    expect(jobs.current.value?.status).toBe('analyzing')
    await jobs.cancel()
    expect(jobs.current.value?.status).toBe('cancelled')
    jobs.suspend()
  })

  it('recovers a newly queued generation after losing the retry response', async () => {
    let admitted = false
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'saved', status: 'cancelled' }] }
      if (url.endsWith('/cancel')) return { jobId: 'saved', status: 'cancelled', execution: { attempt: 1, attemptId: 'old' } }
      if (url.endsWith('/process')) {
        admitted = true
        throw new Error('Response lost')
      }
      return { jobId: 'saved', status: admitted ? 'queued' : 'cancelled', execution: { attempt: admitted ? 2 : 1, maxAttempts: 3, attemptId: admitted ? 'new' : 'old' } }
    })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    await jobs.cancel()
    await jobs.retry()
    expect(jobs.current.value?.status).toBe('queued')
    expect(jobs.cancellationRequested.value).toBe(false)
    expect(jobs.canCancel.value).toBe(true)
    expect(jobs.canRetry.value).toBe(false)
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/process'))).toHaveLength(1)
    expect(jobs.error.value).toContain('response')
    jobs.suspend()
  })

  it('does not clear cancellation when retry recovery returns the old generation', async () => {
    let retryFailed = false
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'saved', status: 'cancelled' }] }
      if (url.endsWith('/process')) {
        retryFailed = true
        throw new Error('Submission unavailable')
      }
      return { jobId: 'saved', status: retryFailed ? 'complete' : 'cancelled', execution: { attemptId: 'old', attempt: 1, maxAttempts: 3 }, resultId: 'a'.repeat(64), layers: [{ extraction_status: 'extracted' }] }
    })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    await jobs.cancel()
    await jobs.retry()
    expect(jobs.current.value?.status).toBe('cancelled')
    expect(jobs.cancellationRequested.value).toBe(true)
    expect(jobs.importReady.value).toBe(false)
    jobs.suspend()
  })

  it('discards a recovery read after the user selects another saved job', async () => {
    const recovery = deferred()
    let reads = 0
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'saved', status: 'failed' }] }
      if (url.endsWith('/process')) throw new Error('Response lost')
      if (url.endsWith('/other')) return { jobId: 'other', status: 'failed' }
      if (++reads > 1) return recovery.promise
      return { jobId: 'saved', status: 'failed', execution: { attemptId: 'old', attempt: 1, maxAttempts: 3 } }
    })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    const retrying = jobs.retry()
    await Promise.resolve()
    await jobs.select('other')
    recovery.resolve({ jobId: 'saved', status: 'queued', execution: { attemptId: 'new', attempt: 2, maxAttempts: 3 } })
    await retrying
    expect(jobs.current.value?.jobId).toBe('other')
    expect(jobs.error.value).toBe('')
    jobs.suspend()
  })

  it('shows older complete jobs without optional metadata but requires result identity for import', async () => {
    const jobs = useBannerDissectionJob(async (url: string) => url.endsWith('/history')
      ? { dissections: [{ jobId: 'older', status: 'complete' }] }
      : { jobId: 'older', status: 'complete', layers: [{ extraction_status: 'extracted' }], tokens: {} })
    await jobs.resume()
    expect(jobs.current.value?.status).toBe('complete')
    expect(jobs.manifest.value).not.toBeNull()
    expect(jobs.importReady.value).toBe(false)
    jobs.suspend()
  })
  it.each([401, 403, 404])('clears saved findings and history after a %s refresh', async (statusCode) => {
    let denied = false
    const jobs = useBannerDissectionJob(async (url) => {
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'saved', status: 'complete' }] }
      if (denied) throw { statusCode }
      return { jobId: 'saved', status: 'complete', resultId: 'a'.repeat(64), warnings: ['Private finding'], layers: [{ extraction_status: 'extracted' }], tokens: {} }
    })
    await jobs.resume()
    expect(jobs.importReady.value).toBe(true)
    denied = true
    await jobs.select('saved')
    expect(jobs.current.value).toBeNull()
    expect(jobs.history.value).toEqual([])
    expect(jobs.manifest.value).toBeNull()
    expect(jobs.importReady.value).toBe(false)
    jobs.suspend()
  })

  it('invalidates an old detail request immediately when project/client scope changes', async () => {
    const old = deferred()
    const fetcher = vi.fn(async (url: string) => url.endsWith('/history') ? { dissections: [] } : old.promise)
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume({ projectId: 'first', clientId: 'client-a' })
    const selecting = jobs.select('old')
    await jobs.resume({ projectId: 'second', clientId: 'client-b' })
    old.resolve({ jobId: 'old', status: 'complete', resultId: 'a'.repeat(64), layers: [{ extraction_status: 'extracted' }], tokens: {} })
    await selecting
    expect(jobs.current.value).toBeNull()
    expect(jobs.history.value).toEqual([])
    expect(jobs.importReady.value).toBe(false)
    expect(fetcher).toHaveBeenLastCalledWith('/api/agency/banner-studio/dissect/history', { query: { projectId: 'second', clientId: 'client-b' } })
    jobs.suspend()
  })

  it('discards late history and upload responses after a scope change', async () => {
    const oldHistory = deferred()
    const oldUpload = deferred()
    let histories = 0
    const jobs = useBannerDissectionJob(async (url) => {
      if (url.endsWith('/history')) return ++histories === 2 ? oldHistory.promise : { dissections: [] }
      if (url.endsWith('/upload')) return oldUpload.promise
      throw new Error('Unexpected detail fetch')
    })
    await jobs.resume({ projectId: 'first' })
    const uploading = jobs.upload(new FormData())
    const loading = jobs.resume({ projectId: 'first' })
    await jobs.resume({ projectId: 'second' })
    oldHistory.resolve({ dissections: [{ jobId: 'old', status: 'complete', warnings: ['Private finding'] }] })
    oldUpload.resolve({ jobId: 'old-upload', status: 'queued' })
    await Promise.all([loading, uploading])
    expect(jobs.current.value).toBeNull()
    expect(jobs.history.value).toEqual([])
    expect(jobs.error.value).toBe('')
    jobs.suspend()
  })

  it.each(['history', 'cancel', 'retry', 'recovery'])('clears all findings when access is revoked during %s', async (operation) => {
    let denied = false
    const fetcher = vi.fn(async (url: string) => {
      if (denied && ((operation === 'history' && url.endsWith('/history'))
        || (operation === 'cancel' && url.endsWith('/cancel'))
        || (operation === 'retry' && url.endsWith('/process'))
        || (operation === 'recovery' && url.endsWith('/saved')))) throw { data: { statusCode: 403 } }
      if (url.endsWith('/history')) return { dissections: [{ jobId: 'saved', status: 'failed' }] }
      if (url.endsWith('/process')) throw new Error('Response lost')
      return { jobId: 'saved', status: 'review_ready', warnings: ['Private finding'], execution: { attemptId: 'old', attempt: 1, maxAttempts: 3 }, tokens: {}, layers: [] }
    })
    const jobs = useBannerDissectionJob(fetcher)
    await jobs.resume()
    denied = true
    if (operation === 'history') await jobs.resume()
    else if (operation === 'cancel') await jobs.cancel()
    else await jobs.retry()
    expect(jobs.current.value).toBeNull()
    expect(jobs.history.value).toEqual([])
    expect(jobs.importReady.value).toBe(false)
    expect(jobs.canRetry.value).toBe(false)
    expect(jobs.error.value).toContain('no longer available')
    jobs.suspend()
  })

  it('drops a cached selection when the refreshed history no longer contains it', async () => {
    let removed = false
    const jobs = useBannerDissectionJob(async url => url.endsWith('/history')
      ? { dissections: removed ? [] : [{ jobId: 'saved', status: 'complete' }] }
      : { jobId: 'saved', status: 'complete', resultId: 'a'.repeat(64), layers: [{ extraction_status: 'extracted' }], tokens: {} })
    await jobs.resume()
    removed = true
    await jobs.resume()
    expect(jobs.current.value).toBeNull()
    expect(jobs.importReady.value).toBe(false)
    jobs.suspend()
  })
})
