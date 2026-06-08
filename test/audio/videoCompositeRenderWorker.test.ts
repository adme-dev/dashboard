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
})
