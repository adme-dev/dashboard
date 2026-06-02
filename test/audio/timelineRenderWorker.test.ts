import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runTimelineRenderJob } from '../../workers/audio-jobs/src/timelineRenderWorker'

// Collaborators are injected, so the orchestration is testable without CF/ffmpeg.
function makeDeps(overrides: any = {}) {
  return {
    loadTimelineState: vi.fn().mockResolvedValue({
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 5,
      tracks: [{ id: 't', name: 'M', kind: 'music', clips: [
        { id: 'c', r2_key: 'k/c', timeline_start_sec: 0, source_out_sec: 5,
          source_in_sec: 0, gain_db: 0, fade_in_sec: 0, fade_out_sec: 0, fade_curve: 'linear', asset_id: null } ] }],
      ducking: []
    }),
    markRendering: vi.fn().mockResolvedValue(undefined),
    renderMaster: vi.fn().mockResolvedValue({ masterKey: 'media/p1/j1/master.wav', wallClockSec: 4 }),
    renderVariants: vi.fn().mockResolvedValue({ radio: 'media/p1/j1/radio.wav' }),
    markDone: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    centsPerSec: 3,
    ...overrides
  }
}

const msg = { jobId: 'j1', projectId: 'p1', timelineId: 't2', channels: ['radio'] }

beforeEach(() => vi.clearAllMocks())

describe('runTimelineRenderJob', () => {
  it('marks rendering, renders master+variants, marks done with cost_cents', async () => {
    const d = makeDeps()
    await runTimelineRenderJob(msg, d as any)
    expect(d.markRendering).toHaveBeenCalledWith('j1')
    expect(d.renderMaster).toHaveBeenCalled()
    expect(d.renderVariants).toHaveBeenCalledWith(expect.objectContaining({ masterKey: 'media/p1/j1/master.wav', channels: ['radio'] }))
    // cost = round(wallClockSec 4 * centsPerSec 3) = 12
    expect(d.markDone).toHaveBeenCalledWith('j1', { radio: 'media/p1/j1/radio.wav' }, 12)
    expect(d.markFailed).not.toHaveBeenCalled()
  })

  it('marks failed (and rethrows for queue retry) when the master render throws', async () => {
    const d = makeDeps({ renderMaster: vi.fn().mockRejectedValue(new Error('ffmpeg boom')) })
    await expect(runTimelineRenderJob(msg, d as any)).rejects.toThrow('ffmpeg boom')
    expect(d.markFailed).toHaveBeenCalledWith('j1', 'ffmpeg boom')
    expect(d.markDone).not.toHaveBeenCalled()
  })
})
