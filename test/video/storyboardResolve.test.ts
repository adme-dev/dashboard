import { beforeEach, describe, expect, it, vi } from 'vitest'
import { id, storyboardFixture } from './fixtures/storyboard'
import { resolveStoryboardIn } from '~~/server/utils/video-storyboard/resolve'

const mocks = vi.hoisted(() => ({ saved: vi.fn(), references: vi.fn(), canonical: vi.fn(), probe: vi.fn(), head: vi.fn(), project: vi.fn(), banner: vi.fn() }))
vi.mock('~~/server/utils/video-storyboard/store', () => ({ getStoryboardIn: mocks.saved, resolveReferenceSetIn: mocks.references }))
vi.mock('~~/server/utils/video-storyboard/references', () => ({ canonicalReferenceIn: mocks.canonical }))
vi.mock('~~/server/utils/video-storyboard/access', () => ({ requireStoryboardProjectIn: mocks.project }))
vi.mock('~~/server/utils/video-storyboard/mediaProbe', () => ({ probeStoryboardMedia: mocks.probe }))
vi.mock('~~/server/utils/storage', () => ({ getFileMetadata: mocks.head }))
vi.mock('~~/server/utils/audio/bannerOverlay', () => ({ loadBannerLayers: mocks.banner }))
const actor = { id: id(6), role: 'member' }
const input = { actor, projectId: id(2), revisionId: id(3), formats: ['reels_9x16'] as const }
const query = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  const plan = storyboardFixture()
  mocks.saved.mockResolvedValue({ revision: { plan }, referenceSet: { references: [] } })
  mocks.references.mockResolvedValue({ eligible: true, findings: [], referenceSet: { references: [{ sourceKind: 'video_asset', assetId: id(20), contentHash: 'b'.repeat(64), decision: 'approved', approval: { contentHash: 'b'.repeat(64) } }] } })
  mocks.project.mockResolvedValue({ id: id(2) })
  mocks.canonical.mockResolvedValue({ contentHash: 'b'.repeat(64) })
  mocks.head.mockResolvedValue({ etag: 'bytes-1', size: 100 })
  mocks.probe.mockResolvedValue({ kind: 'video', durationSeconds: 8, width: 1080, height: 1920 })
  query.mockResolvedValue({ rows: [{ id: id(20), r2_key: 'owned/video.mp4', duration_sec: 500 }] })
})
describe('authorized storyboard resolution', () => {
  it('uses measured private bytes, ignoring requested/row durations and probes repeated media once', async () => {
    const result = await resolveStoryboardIn({ query }, input)
    expect(result.assets[`video_asset:${id(20)}`]).toMatchObject({ durationSeconds: 8, r2Key: 'owned/video.mp4' })
    expect(mocks.probe).toHaveBeenCalledTimes(1)
    expect(mocks.probe).toHaveBeenCalledWith({ r2Key: 'owned/video.mp4', expectedEtag: 'bytes-1', expectedSize: 100 }, expect.anything())
  })
  it('denies access before reading a revision or probing', async () => {
    mocks.project.mockRejectedValueOnce(new Error('denied'))
    await expect(resolveStoryboardIn({ query }, input)).rejects.toThrow('denied')
    expect(mocks.saved).not.toHaveBeenCalled()
    expect(mocks.probe).not.toHaveBeenCalled()
  })
  it('blocks missing usage approval even for an accessible source', async () => {
    mocks.references.mockResolvedValue({ findings: [], referenceSet: { references: [] } })
    const result = await resolveStoryboardIn({ query }, input)
    expect(result.findings.map(f => f.code)).toContain('usage_approval_required')
    expect(mocks.probe).not.toHaveBeenCalled()
  })
  it('blocks changed and missing canonical media without leaking its locator', async () => {
    mocks.canonical.mockResolvedValue({ contentHash: 'c'.repeat(64) })
    const result = await resolveStoryboardIn({ query }, input)
    expect(result.findings.map(f => f.code)).toContain('source_unavailable')
    expect(result.assets).toEqual({})
  })
  it('fails closed on unavailable measurement and preserves the plan', async () => {
    mocks.probe.mockRejectedValue(new Error('no service'))
    const result = await resolveStoryboardIn({ query }, input)
    expect(result.findings.map(f => f.code)).toContain('source_unavailable')
    expect(result.assets).toEqual({})
    expect(query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true)
  })
})

describe('exact Banner layout resolution', () => {
  beforeEach(async () => {
    const saved = await mocks.saved()
    const shot = saved.revision.plan.shots[5]
    shot.overlayCues = [{ id: 'offer', copyCueId: 'offer', startFrame: 0, durationFrames: 150, asset: { status: 'bound', sourceKind: 'banner_project', assetId: id(22), contentHash: 'b'.repeat(64) } }]
    const refs = await mocks.references()
    refs.referenceSet.references.push({ sourceKind: 'banner_project', assetId: id(22), contentHash: 'b'.repeat(64), decision: 'approved', approval: { contentHash: 'b'.repeat(64) } })
    mocks.banner.mockResolvedValue({ width: 1080, height: 1920, layers: [{ type: 'text', text: saved.revision.plan.copy.cues[0].text, opacity: 1, x: 50, y: 50, w: 400, h: 100, startTime: 0, endTime: 5, animIn: 'none' }] })
  })
  it('pins exact whitespace and each requested format layout', async () => {
    const result = await resolveStoryboardIn({ query }, { ...input, formats: ['reels_9x16', 'square_1x1'] })
    expect(result.overlays[`${id(15)}:offer`]).toMatchObject({ text: '$39,990 drive away*\n*T&Cs apply.  ', layouts: { reels_9x16: { formatKey: 'fb_story' }, square_1x1: { formatKey: 'ig_sq' } } })
    expect(mocks.banner).toHaveBeenCalledTimes(2)
  })
  it.each(['text', 'hidden', 'bounds', 'timing', 'font'])('blocks incorrect %s instead of substituting a layout', async (reason) => {
    const canvas = await mocks.banner()
    if (reason === 'text') canvas.layers[0].text = 'Shortened offer'
    if (reason === 'hidden') canvas.layers[0].hidden = true
    if (reason === 'bounds') canvas.layers[0].x = -1
    if (reason === 'timing') canvas.layers[0].endTime = 4
    if (reason === 'font') mocks.banner.mockRejectedValue(new Error('font unavailable'))
    const result = await resolveStoryboardIn({ query }, input)
    expect(result.overlays).toEqual({})
    expect(result.findings.map(f => f.code)).toContain('source_unavailable')
  })
})
