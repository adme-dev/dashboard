import { describe, expect, it } from 'vitest'
import { visibleGenerationJobs, FINISHED_JOB_VISIBILITY_MS } from '~~/app/utils/video/generationStatusVisibility'
import type { VideoGenerationJobView } from '~~/app/composables/useVideoGenerationJobs'

const NOW = Date.parse('2026-06-11T12:00:00Z')

function job(over: Partial<VideoGenerationJobView>): VideoGenerationJobView {
  return {
    id: 'job-1',
    status: 'queued',
    mode: 't2v',
    modelId: 'model',
    prompt: 'a prompt',
    outputAssetId: null,
    outputR2Key: null,
    errorMessage: null,
    createdAt: '2026-06-11T11:00:00Z',
    startedAt: null,
    completedAt: null,
    ...over
  }
}

describe('visibleGenerationJobs', () => {
  it('always shows active jobs regardless of age', () => {
    const jobs = [job({ status: 'queued' }), job({ id: 'job-2', status: 'running' })]
    expect(visibleGenerationJobs(jobs, new Set(), NOW)).toHaveLength(2)
  })

  it('shows recently finished jobs', () => {
    const jobs = [job({ status: 'failed', completedAt: new Date(NOW - 60_000).toISOString() })]
    expect(visibleGenerationJobs(jobs, new Set(), NOW)).toHaveLength(1)
  })

  it('hides finished jobs older than the visibility window (no stale cards on page load)', () => {
    const jobs = [
      job({ status: 'failed', completedAt: new Date(NOW - FINISHED_JOB_VISIBILITY_MS - 1000).toISOString() }),
      job({ id: 'job-2', status: 'succeeded', completedAt: '2026-06-09T08:00:00Z' })
    ]
    expect(visibleGenerationJobs(jobs, new Set(), NOW)).toHaveLength(0)
  })

  it('hides finished jobs with no completedAt instead of showing them forever', () => {
    const jobs = [job({ status: 'failed', completedAt: null })]
    expect(visibleGenerationJobs(jobs, new Set(), NOW)).toHaveLength(0)
  })

  it('hides dismissed jobs', () => {
    const jobs = [job({ status: 'failed', completedAt: new Date(NOW - 1000).toISOString() })]
    expect(visibleGenerationJobs(jobs, new Set(['job-1']), NOW)).toHaveLength(0)
  })

  it('excludes blocked jobs and caps the list', () => {
    const jobs = [
      job({ id: 'b', status: 'blocked' }),
      ...Array.from({ length: 6 }, (_, i) => job({ id: `q-${i}` }))
    ]
    expect(visibleGenerationJobs(jobs, new Set(), NOW).map(j => j.id)).toEqual(['q-0', 'q-1', 'q-2', 'q-3'])
  })
})
