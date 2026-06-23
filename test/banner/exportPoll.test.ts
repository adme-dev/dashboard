import { describe, it, expect } from 'vitest'
import { summarizeExportJobs } from '~~/app/utils/bannerExportPoll'

const j = (status: string, url?: string) => ({ jobId: 'x', formatKey: 'a', status, url: url ?? null, fileSize: null, error: null })

describe('summarizeExportJobs', () => {
  it('computes progress and completion across jobs', () => {
    expect(summarizeExportJobs([j('done', 'u'), j('rendering')])).toEqual({ total: 2, done: 1, failed: 0, progress: 50, finished: false, urls: ['u'] })
    expect(summarizeExportJobs([j('done', 'u1'), j('failed')])).toEqual({ total: 2, done: 1, failed: 1, progress: 100, finished: true, urls: ['u1'] })
    expect(summarizeExportJobs([])).toEqual({ total: 0, done: 0, failed: 0, progress: 0, finished: true, urls: [] })
  })
})
