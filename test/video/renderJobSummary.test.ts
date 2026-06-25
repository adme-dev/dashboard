import { describe, expect, it } from 'vitest'
import type { MediaRenderJob } from '~~/app/types'
import {
  parseRenderFailure,
  renderVariantFormats,
  renderVariantUrl,
  summarizeVideoRenderJobs,
} from '~~/app/utils/video/renderJobSummary'

function job(input: Partial<MediaRenderJob>): MediaRenderJob {
  return {
    id: 'job-1',
    timelineId: 'timeline-1',
    projectId: 'project-1',
    channels: [],
    status: 'queued',
    variants: {},
    costCents: null,
    error: null,
    requestedBy: 'user-1',
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z',
    ...input,
  }
}

describe('video render job summary', () => {
  it('counts active, completed, and failed render jobs', () => {
    const summary = summarizeVideoRenderJobs([
      job({ id: 'queued', status: 'queued' }),
      job({ id: 'rendering', status: 'rendering' }),
      job({ id: 'done', status: 'done' }),
      job({ id: 'failed', status: 'failed' }),
    ])

    expect(summary).toMatchObject({ total: 4, active: 2, completed: 1, failed: 1 })
  })

  it('selects the latest job by created time', () => {
    const summary = summarizeVideoRenderJobs([
      job({ id: 'older', createdAt: '2026-06-19T00:00:00.000Z' }),
      job({ id: 'newer', createdAt: '2026-06-19T01:00:00.000Z' }),
    ])

    expect(summary.latest?.id).toBe('newer')
  })

  it('builds stable render variant labels and URLs', () => {
    const done = job({ variants: { reels_9x16: 'a.mp4', square_1x1: 'b.mp4' } })

    expect(renderVariantFormats(done)).toEqual(['reels_9x16', 'square_1x1'])
    expect(renderVariantUrl('project/1', 'job/1', 'reels_9x16')).toBe('/api/agency/audio/projects/project%2F1/renders/job%2F1/reels_9x16')
  })

  it('parses categorized render failures for display', () => {
    expect(parseRenderFailure('runtime_not_ready: runtime_not_ready after 2500ms')).toEqual({
      category: 'runtime_not_ready',
      label: 'Render runtime not ready',
      details: 'runtime_not_ready after 2500ms',
      retryable: true,
    })
    expect(parseRenderFailure('invalid_composition: missing runtime')).toMatchObject({
      label: 'Invalid composition',
      retryable: false,
    })
    expect(parseRenderFailure('plain failure')).toMatchObject({
      category: null,
      label: 'Render failed',
      details: 'plain failure',
      retryable: true,
    })
  })
})
