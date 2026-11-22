import { describe, expect, it } from 'vitest'
import type { MediaRenderJob } from '~~/app/types'
import {
  creativeVersionLabelForRenderJob,
  renderFailureHistoryNote,
  renderStageMeter,
  parseRenderFailure,
  renderVariantFormats,
  renderVariantUrl,
  summarizeVideoRenderJobs
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
    ...input
  }
}

describe('video render job summary', () => {
  it('counts active, completed, and failed render jobs', () => {
    const summary = summarizeVideoRenderJobs([
      job({ id: 'queued', status: 'queued' }),
      job({ id: 'rendering', status: 'rendering' }),
      job({ id: 'done', status: 'done' }),
      job({ id: 'failed', status: 'failed' })
    ])

    expect(summary).toMatchObject({ total: 4, active: 2, completed: 1, failed: 1 })
  })

  it('selects the latest job by created time', () => {
    const summary = summarizeVideoRenderJobs([
      job({ id: 'older', createdAt: '2026-06-19T00:00:00.000Z' }),
      job({ id: 'newer', createdAt: '2026-06-19T01:00:00.000Z' })
    ])

    expect(summary.latest?.id).toBe('newer')
  })

  it('builds stable render variant labels and URLs', () => {
    const done = job({ variants: { reels_9x16: 'a.mp4', square_1x1: 'b.mp4' } })

    expect(renderVariantFormats(done)).toEqual(['reels_9x16', 'square_1x1'])
    expect(renderVariantUrl('project/1', 'job/1', 'reels_9x16')).toBe('/api/agency/audio/projects/project%2F1/renders/job%2F1/reels_9x16')
  })

  it('builds a creative version label for render jobs', () => {
    expect(creativeVersionLabelForRenderJob(job({
      id: 'render-2',
      status: 'done',
      variants: { reels_9x16: 'a.mp4', square_1x1: 'b.mp4' }
    }))).toBe('Version render-2 · reels_9x16, square_1x1')

    expect(creativeVersionLabelForRenderJob(job({
      id: 'render-3',
      status: 'failed',
      variants: {}
    }))).toBe('Version render-3 · failed')
  })

  it('keeps a failure actionable until newer successful outputs cover its request', () => {
    const failed = job({ status: 'failed', channels: ['reels_9x16', 'square_1x1'] })
    const later = job({ status: 'done', createdAt: '2026-06-20T00:00:00Z', variants: { reels_9x16: 'r' } })
    expect(renderFailureHistoryNote(failed, [later])).toBeNull()
    expect(renderFailureHistoryNote(failed, [later, { ...later, projectId: 'another', variants: { square_1x1: 's' } }])).toBeNull()
    expect(renderFailureHistoryNote(failed, [later, { ...later, variants: { square_1x1: 's' } }])).toBe('Later renders produced all of these outputs.')
    expect(renderFailureHistoryNote({ ...failed, channels: [] }, [later])).toContain('output selection for this earlier attempt is unknown')
    expect(renderFailureHistoryNote({ ...failed, channels: [], progress: {
      stage: 'encoding', formatKey: 'square_1x1', total: 2, done: 0, updatedAt: ''
    } }, [later])).toBeNull()
  })

  it('parses categorized render failures for display', () => {
    expect(parseRenderFailure('runtime_not_ready: runtime_not_ready after 2500ms')).toEqual({
      category: 'runtime_not_ready',
      label: 'Render runtime not ready',
      details: 'runtime_not_ready after 2500ms',
      retryable: true
    })
    expect(parseRenderFailure('invalid_composition: missing runtime')).toMatchObject({
      label: 'Invalid composition',
      retryable: false
    })
    expect(parseRenderFailure('plain failure')).toMatchObject({
      category: null,
      label: 'Render failed',
      details: 'plain failure',
      retryable: true
    })
  })
})

describe('render stage meter', () => {
  it('uses indeterminate progress when measurements are missing or invalid', () => {
    for (const counters of [{}, { framesDone: -1, framesTotal: 30 }, { framesDone: NaN, framesTotal: 30 }, { framesDone: 3, framesTotal: 0 }]) {
      expect(renderStageMeter(job({ status: 'rendering', progress: { stage: 'capturing', ...counters, formatKey: null, done: 0, total: 1, updatedAt: '' } }))).toMatchObject({ label: 'Preparing artwork', value: null })
    }
  })
  it('clamps an overrun and never interprets a terminal job as active', () => {
    const progress = { stage: 'capturing' as const, framesDone: 40, framesTotal: 30, formatKey: null, done: 0, total: 1, updatedAt: '' }
    expect(renderStageMeter(job({ status: 'rendering', progress }))).toMatchObject({ value: 30, max: 30 })
    expect(renderStageMeter(job({ status: 'failed', progress }))).toBeNull()
    expect(renderStageMeter(job({ status: 'done', progress }))).toBeNull()
  })
  it('preserves legacy rendering without inventing measured progress', () => {
    expect(renderStageMeter(job({ status: 'rendering' }))).toBeNull()
    expect(renderStageMeter(job({ status: 'rendering', progress: { stage: 'rendering', done: 0, total: 1, formatKey: 'reels_9x16', updatedAt: '' } }))).toMatchObject({ label: 'Preparing render', value: null })
  })
})
