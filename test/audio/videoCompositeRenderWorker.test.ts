import { describe, it, expect, vi } from 'vitest'
import { runVideoCompositeJob } from '../../workers/audio-jobs/src/videoCompositeRender'

function deps(over: any = {}) {
  return {
    loadTimelineState: vi.fn().mockResolvedValue({ schema_version: 2 }),
    markRendering: vi.fn().mockResolvedValue(undefined),
    renderOne: vi.fn(async ({ formatKey }: any) => ({ key: `media/p/j/${formatKey}.mp4` })),
    markDone: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    centsPerSec: 2, ...over
  }
}
describe('runVideoCompositeJob', () => {
  it('renders each format and marks done with the variants map', async () => {
    const d = deps()
    await runVideoCompositeJob({ jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16', 'square_1x1'] }, d as any)
    expect(d.markRendering).toHaveBeenCalledWith('j')
    expect(d.renderOne).toHaveBeenCalledTimes(2)
    expect(d.markDone.mock.calls[0][1]).toEqual({ reels_9x16: 'media/p/j/reels_9x16.mp4', square_1x1: 'media/p/j/square_1x1.mp4' })
  })
  it('marks failed and rethrows on error', async () => {
    const d = deps({ renderOne: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(runVideoCompositeJob({ jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16'] }, d as any)).rejects.toThrow('boom')
    expect(d.markFailed).toHaveBeenCalledWith('j', 'boom')
  })
  it('threads resolvedOverlays from the message through to deps.renderOne', async () => {
    const overlays = [
      { clipId: 'o1', htmlKey: 'media/p/j/overlay-o1.html', timeline_start_sec: 0, duration_sec: 5 }
    ]
    const d = deps()
    await runVideoCompositeJob(
      { jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16'], resolvedOverlays: overlays },
      d as any
    )
    expect(d.renderOne).toHaveBeenCalledTimes(1)
    expect(d.renderOne.mock.calls[0][0]).toMatchObject({ formatKey: 'reels_9x16', resolvedOverlays: overlays })
  })
  it('threads per-format resolved overlays to the matching render only', async () => {
    const d = deps()
    const byFormat = {
      reels_9x16: [
        { clipId: 'o1', htmlKey: 'media/p/j/reels_9x16/overlay-o1.html', timeline_start_sec: 0, duration_sec: 5 }
      ],
      youtube_16x9: [
        { clipId: 'o1', htmlKey: 'media/p/j/youtube_16x9/overlay-o1.html', timeline_start_sec: 0, duration_sec: 5 }
      ],
    }
    await runVideoCompositeJob(
      { jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16', 'youtube_16x9'], resolvedOverlaysByFormat: byFormat },
      d as any
    )

    expect(d.renderOne).toHaveBeenCalledTimes(2)
    expect(d.renderOne.mock.calls[0][0]).toMatchObject({ formatKey: 'reels_9x16', resolvedOverlays: byFormat.reels_9x16 })
    expect(d.renderOne.mock.calls[1][0]).toMatchObject({ formatKey: 'youtube_16x9', resolvedOverlays: byFormat.youtube_16x9 })
  })
  it('passes undefined resolvedOverlays when the message has none', async () => {
    const d = deps()
    await runVideoCompositeJob(
      { jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16'] },
      d as any
    )
    expect(d.renderOne).toHaveBeenCalledTimes(1)
    // resolvedOverlays should be undefined (not a filled array) when not in the message
    expect(d.renderOne.mock.calls[0][0].resolvedOverlays).toBeUndefined()
  })

  it('reports per-format progress before each render and a final done stage', async () => {
    const markProgress = vi.fn().mockResolvedValue(undefined)
    const d = deps({ markProgress })
    await runVideoCompositeJob({ jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16', 'square_1x1'] }, d as any)
    expect(markProgress.mock.calls.map(([, p]: any[]) => [p.stage, p.formatKey, p.done, p.total])).toEqual([
      ['rendering', 'reels_9x16', 0, 2],
      ['rendering', 'square_1x1', 1, 2],
      ['done', null, 2, 2],
    ])
  })

  it('never fails a render because progress reporting failed', async () => {
    const d = deps({ markProgress: vi.fn().mockRejectedValue(new Error('db hiccup')) })
    await expect(runVideoCompositeJob({ jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16'] }, d as any)).resolves.toBeUndefined()
    expect(d.markDone).toHaveBeenCalledOnce()
    expect(d.markFailed).not.toHaveBeenCalled()
  })
})
