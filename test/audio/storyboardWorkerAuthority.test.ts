import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadStoryboardRenderInputs, callStoryboardRenderAuthority } from '../../workers/audio-jobs/src/storyboardRenderAuthority'
import { digestMcpRequestBody } from '../../shared/utils/mcpRequestClaim'
import { StoryboardPublicationUncertainError } from '../../workers/audio-jobs/src/videoCompositeRender'

const { queryOne } = vi.hoisted(() => ({ queryOne: vi.fn() }))
vi.mock('../../workers/audio-jobs/src/db', () => ({ queryOne }))
const msg = { jobId: 'j', projectId: 'p', timelineId: 't', formats: ['square_1x1'] }
const row = { project_id: 'p', timeline_id: 't', status: 'queued', obligated: true, manifest: null, manifest_hash: null }
beforeEach(() => vi.restoreAllMocks())
describe('actual worker authority adapter', () => {
  it('fails closed for an obligated timeline with no stored manifest', async () => {
    queryOne.mockResolvedValue(row)
    await expect(loadStoryboardRenderInputs(msg)).rejects.toThrow('manifest required')
  })
  it('only permits verified legacy timeline fallback', async () => {
    queryOne.mockResolvedValue({ ...row, obligated: false })
    await expect(loadStoryboardRenderInputs(msg)).resolves.toBeNull()
  })
  it('rejects tampered persisted manifest digest', async () => {
    queryOne.mockResolvedValue({ ...row, manifest: msg, manifest_hash: 'bad' })
    await expect(loadStoryboardRenderInputs(msg)).rejects.toThrow('fingerprint')
    queryOne.mockResolvedValue({ ...row, manifest: msg, manifest_hash: await digestMcpRequestBody(msg) })
    await expect(loadStoryboardRenderInputs(msg)).resolves.toMatchObject({ manifest: msg })
  })
  it.each(['http://app.xeroflow.io', 'https://evil.test', 'https://app.xeroflow.io@evil.test', 'https://app.xeroflow.io/other', 'https://agency-dashboard.pages.dev', 'https://agency-dashboard-6cm.pages.dev.evil.test', 'https://preview.agency-dashboard-6cm.pages.dev'])('rejects callback origin %s', async (origin) => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    await expect(callStoryboardRenderAuthority({ STORYBOARD_APP_ORIGIN: origin, STORYBOARD_RENDER_SECRET: 'test' }, { action: 'check', jobId: 'j', manifestHash: 'h' })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('uses edge-compatible manual redirects and never follows a redirected authority request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.redirect === 'error') throw new TypeError('Unsupported edge redirect mode')
      return new Response(null, { status: 302, headers: { location: 'https://untrusted.example/collect' } })
    })
    await expect(callStoryboardRenderAuthority({ STORYBOARD_APP_ORIGIN: 'https://app.xeroflow.io', STORYBOARD_RENDER_SECRET: 'test' }, { action: 'check', jobId: 'j', manifestHash: 'h' })).rejects.toThrow('eligibility rejected')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(new URL('https://app.xeroflow.io/api/internal/video-storyboard/render-eligibility'), expect.objectContaining({ redirect: 'manual' }))
  })
  it('accepts a successful authority response with the edge-compatible redirect mode', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await expect(callStoryboardRenderAuthority({ STORYBOARD_APP_ORIGIN: 'https://app.xeroflow.io', STORYBOARD_RENDER_SECRET: 'test' }, { action: 'check', jobId: 'j', manifestHash: 'h' })).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: 'manual' }))
  })
  it('retains ambiguous publication outcomes rather than deleting potentially published bytes', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
    await expect(callStoryboardRenderAuthority({ STORYBOARD_APP_ORIGIN: 'https://app.xeroflow.io', STORYBOARD_RENDER_SECRET: 'test' }, { action: 'publish', jobId: 'j', manifestHash: 'h' })).rejects.toBeInstanceOf(StoryboardPublicationUncertainError)
  })
})

it.each([408, 429, 500, 503])('treats publication HTTP %s as uncertain', async (status) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }))
  await expect(callStoryboardRenderAuthority({ STORYBOARD_APP_ORIGIN: 'https://app.xeroflow.io', STORYBOARD_RENDER_SECRET: 'test' }, { action: 'publish', jobId: 'j', manifestHash: 'h' })).rejects.toBeInstanceOf(StoryboardPublicationUncertainError)
})
