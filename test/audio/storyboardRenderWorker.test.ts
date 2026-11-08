import { describe, it, expect, vi } from 'vitest'
import { runVideoCompositeJob, StoryboardPublicationUncertainError } from '../../workers/audio-jobs/src/videoCompositeRender'

const message = { jobId: 'j', projectId: 'p', timelineId: 't', formats: ['reels_9x16'] }
const manifest = { id: 'm', ...message, editRevision: 4, state: { approved: true }, resolvedOverlaysByFormat: {}, objects: [] }
function setup() {
  return {
    loadRenderInputs: vi.fn<import('../../workers/audio-jobs/src/videoCompositeRender').VideoRenderDeps['loadRenderInputs']>().mockResolvedValue({ manifest, manifestHash: 'h' }),
    loadTimelineState: vi.fn().mockResolvedValue({ edited: true }),
    checkEligibility: vi.fn().mockResolvedValue(undefined),
    publishApproved: vi.fn().mockResolvedValue(undefined),
    markRendering: vi.fn(), markFailed: vi.fn(), markDone: vi.fn(), discardOutput: vi.fn().mockResolvedValue(undefined),
    renderOne: vi.fn().mockResolvedValue({ key: 'private.mp4' }), centsPerSec: 2
  }
}
describe('storyboard queue authority', () => {
  it('uses DB manifest even when queue omits manifest identity, never live timeline', async () => {
    const d = setup()
    await runVideoCompositeJob(message, d)
    expect(d.loadTimelineState).not.toHaveBeenCalled()
    expect(d.renderOne).toHaveBeenCalledWith(expect.objectContaining({ state: manifest.state, pinnedObjects: [] }))
    expect(d.checkEligibility).toHaveBeenCalledWith('j', 'h')
    expect(d.publishApproved).toHaveBeenCalledWith('j', 'h', { reels_9x16: 'private.mp4' }, expect.any(Number))
    expect(d.markDone).not.toHaveBeenCalled()
  })
  it('rejects queue identity/format substitution', async () => {
    const d = setup()
    await expect(runVideoCompositeJob({ ...message, projectId: 'other' }, d)).rejects.toThrow()
    expect(d.renderOne).not.toHaveBeenCalled()
  })
  it('does not publish when eligibility was revoked while queued', async () => {
    const d = setup()
    d.checkEligibility.mockRejectedValue(new Error('revoked'))
    await expect(runVideoCompositeJob(message, d)).rejects.toThrow('revoked')
    expect(d.renderOne).not.toHaveBeenCalled()
    expect(d.markDone).not.toHaveBeenCalled()
  })
  it('discards rendered bytes when atomic publication refuses revoked dependency', async () => {
    const d = setup()
    d.publishApproved.mockRejectedValue(new Error('revoked'))
    await expect(runVideoCompositeJob(message, d)).rejects.toThrow('revoked')
    expect(d.discardOutput).toHaveBeenCalledWith('private.mp4')
    expect(d.markDone).not.toHaveBeenCalled()
  })
  it('fails closed without the mandatory authority loader', async () => {
    const d = setup()
    await expect(runVideoCompositeJob(message, { ...d, loadRenderInputs: undefined })).rejects.toThrow()
    expect(d.renderOne).not.toHaveBeenCalled()
  })
})

it('acknowledges an already published job without rerendering', async () => {
  const d = setup()
  d.loadRenderInputs.mockResolvedValue({ completed: true })
  await runVideoCompositeJob(message, d)
  expect(d.renderOne).not.toHaveBeenCalled()
  expect(d.markRendering).not.toHaveBeenCalled()
})

it('retains outputs and status when publication may already have committed', async () => {
  const d = setup()
  d.publishApproved.mockRejectedValue(new StoryboardPublicationUncertainError('response lost'))
  await expect(runVideoCompositeJob(message, d)).rejects.toThrow('response lost')
  expect(d.discardOutput).not.toHaveBeenCalled()
  expect(d.markFailed).not.toHaveBeenCalled()
})

it.each([408, 429])('retains published bytes on HTTP %s and reconciles done on retry', async (status) => {
  const { callStoryboardRenderAuthority } = await import('../../workers/audio-jobs/src/storyboardRenderAuthority')
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }))
  const d = setup()
  const markProgress = vi.fn().mockResolvedValue(undefined)
  d.publishApproved.mockImplementation((jobId, manifestHash, variants, costCents) => callStoryboardRenderAuthority({ STORYBOARD_APP_ORIGIN: 'https://app.xeroflow.io', STORYBOARD_RENDER_SECRET: 'test' }, { action: 'publish', jobId, manifestHash, variants, costCents }))
  try {
    await expect(runVideoCompositeJob(message, { ...d, markProgress })).rejects.toBeInstanceOf(StoryboardPublicationUncertainError)
    expect(d.discardOutput).not.toHaveBeenCalled()
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(markProgress.mock.calls.some(([, p]) => p.stage === 'done')).toBe(false)
    d.loadRenderInputs.mockResolvedValue({ completed: true })
    await runVideoCompositeJob(message, d)
    expect(d.renderOne).toHaveBeenCalledOnce()
  } finally {
    fetch.mockRestore()
  }
})
