import type { StoryboardObligations } from '~~/shared/video/storyboardCompile'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { prepareStoryboardRenderIn } from '~~/server/utils/video-storyboard/renderValidation'

const mocks = vi.hoisted(() => ({ load: vi.fn(), saved: vi.fn(), identity: vi.fn(), refs: vi.fn(), banner: vi.fn(), html: vi.fn(), measure: vi.fn(), probe: vi.fn(), metadata: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/video-storyboard/access', () => ({ requireStoryboardProjectIn: async () => ({ id: 'p', clientId: null }) }))
vi.mock('~~/server/utils/video-storyboard/lineage', () => ({ loadTimelineObligationsIn: mocks.load }))
vi.mock('~~/server/utils/video-storyboard/store', () => ({ getStoryboardIn: mocks.saved }))
vi.mock('~~/server/utils/video-storyboard/references', () => ({ canonicalReferenceIn: mocks.identity, checkReferencesIn: mocks.refs, storyboardFileMetadata: mocks.metadata }))
vi.mock('~~/server/utils/video-storyboard/mediaProbe', () => ({ probeStoryboardMedia: mocks.probe }))
vi.mock('~~/server/utils/audio/bannerOverlay', () => ({ loadBannerLayers: mocks.banner }))
vi.mock('~~/server/utils/banner/htmlBuilder', () => ({ buildBannerHTML: mocks.html }))
vi.mock('~~/server/utils/video-storyboard/copyMeasurement', () => ({ measureStoryboardCopy: mocks.measure }))
const input = { actor: { id: 'u', role: 'member' }, projectId: 'p', timelineId: 't', editRevision: 1, formats: ['reels_9x16', 'square_1x1', 'youtube_16x9'] as const }
let state: ReturnType<typeof TimelineStateSchema.parse>
let contract: StoryboardObligations
let query: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  state = TimelineStateSchema.parse({ media_type: 'av', schema_version: 2, duration_sec: 3, tracks: [{ id: 'overlay', name: 'Overlay', kind: 'overlay', clips: [{ id: 'o', type: 'overlay', gsap_project_id: 'banner', gsap_format_key: 'fb_story', timeline_start_sec: 0, duration_sec: 3 }] }] })
  contract = { revisionId: 'r', copyRevisionId: 'copy', copyHash: 'a'.repeat(64), sources: [{ clipId: 'o', shotId: 'shot', sourceKind: 'banner_project', assetId: 'banner', contentHash: 'approved', startFrame: 0, durationFrames: 90, sourceInFrames: 0 }], cues: [{ clipId: 'o', shotId: 'shot', copyId: 'offer', cueId: 'cue', text: 'Exact  copy\n*Terms', required: true, startFrame: 0, durationFrames: 90 }] }
  mocks.load.mockImplementation(async () => ({ applicationId: 'a', contract, baseline: structuredClone(state), referenceSetId: 'refs', review: null }))
  mocks.saved.mockResolvedValue({ referenceSet: { id: 'refs', references: [{ sourceKind: 'banner_project', assetId: 'banner', contentHash: 'approved', decision: 'approved', approval: { contentHash: 'approved' } }], brandKit: null }, revision: { plan: { shots: [] } } })
  mocks.identity.mockResolvedValue({ contentHash: 'approved' })
  mocks.refs.mockResolvedValue([])
  mocks.banner.mockResolvedValue({ width: 1080, height: 1920, layers: [{ id: 'text', type: 'text', text: 'Exact  copy\n*Terms', hidden: false, opacity: 1, startTime: 0, endTime: 3, animIn: 'none', animOut: 'none' }], playback: {}, customFonts: [] })
  mocks.html.mockReturnValue('<html><head></head><body><div data-id="text">Exact  copy\n*Terms</div><script>window.__engagrFrame=function(){};</script></body></html>')
  mocks.measure.mockResolvedValue([])
  query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM media_timelines')) return { rows: [{ id: 't', edit_revision: 1, state }] }
    if (sql.includes('FROM video_storyboard_revisions')) return { rows: [{ copy: { id: '00000000-0000-4000-8000-000000000001', revision: 1, scriptSegments: [], cues: [], contentHash: 'a'.repeat(64), approval: { actorId: '00000000-0000-4000-8000-000000000002', approvedAt: '2026-11-05T00:00:00.000Z', contentHash: 'a'.repeat(64) } } }] }
    if (sql.includes('FROM banner_projects')) return { rows: [{ id: 'banner', client_id: null, canvas_data: {} }] }
    return { rows: [] }
  })
})
const run = () => prepareStoryboardRenderIn({ query }, input)
describe('current and per-format render readiness', () => {
  it('resolves each format independently and preserves complete supplied text in measurement', async () => {
    const result = await run()
    expect(result.findings).toEqual([])
    expect(mocks.banner.mock.calls.map(c => c[1])).toEqual(['fb_story', 'ig_sq', 'tt_land'])
    expect(mocks.measure.mock.calls.map(c => c[0].required[0].text)).toEqual(Array(3).fill('Exact  copy\n*Terms'))
    expect(mocks.measure.mock.calls.every(c => !c[0].html.includes('<script>'))).toBe(true)
  })
  it.each(['square_1x1', 'youtube_16x9'])('blocks actual glyph overflow in %s while portrait passes', async (format) => {
    mocks.measure.mockImplementation(async input => input.width === (format === 'square_1x1' ? 1080 : 1920) && input.height === 1080 ? [{ code: 'copy_overflow', severity: 'blocker', message: 'Full copy overflows' }] : [])
    expect((await run()).findings.map(f => f.code)).toContain('copy_overflow')
  })
  it('keeps a long disclaimer exact and never falls back to shortening it', async () => {
    const text = 'Terms and conditions. '.repeat(200)
    contract.cues[0].text = text
    mocks.banner.mockResolvedValue({ width: 1080, height: 1920, layers: [{ id: 'text', type: 'text', text, opacity: 1, startTime: 0, endTime: 3 }] })
    mocks.measure.mockResolvedValue([{ code: 'copy_overflow', severity: 'blocker', message: 'Too long' }])
    expect((await run()).findings).toHaveLength(3)
    expect(mocks.measure.mock.calls[0][0].required[0].text).toBe(text)
  })
  it.each(['font unavailable', 'measurement unavailable'])('fails closed for %s', async (reason) => {
    if (reason.startsWith('font')) mocks.banner.mockRejectedValue(new Error(reason))
    else mocks.measure.mockRejectedValue(new Error(reason))
    expect((await run()).findings.map(f => f.code)).toContain('copy_layout_unavailable')
  })
  it.each(['changed banner', 'revoked source', 'generation approval changed'])('blocks %s after application', async (reason) => {
    if (reason === 'changed banner') mocks.identity.mockResolvedValue({ contentHash: 'changed' })
    else mocks.identity.mockRejectedValue(new Error(reason))
    expect((await run()).findings.map(f => f.code)).toContain('source_unavailable')
  })
  it('rejects stale timeline identity before source work', async () => {
    await expect(prepareStoryboardRenderIn({ query }, { ...input, editRevision: 2 })).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.identity).not.toHaveBeenCalled()
  })
})

it('passes real Banner HTML through both transport and container static-input validators with compiled-style IDs', async () => {
  const { buildBannerHTML } = await vi.importActual<typeof import('~~/server/utils/banner/htmlBuilder')>('~~/server/utils/banner/htmlBuilder')
  const { validateCopyMeasurementInput } = await import('~~/shared/video-storyboard/copyMeasurement')
  const { validateStaticCopy } = await import('../../workers/audio-jobs/container/copyMeasurement.mjs')
  mocks.html.mockImplementation(buildBannerHTML)
  const clipId = 'sb:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002:overlay:terms'
  state.tracks[0].clips[0].id = clipId
  contract.sources[0].clipId = clipId
  contract.cues[0].clipId = clipId
  mocks.banner.mockImplementation(async (_id, format) => ({ width: format === 'tt_land' ? 1920 : 1080, height: format === 'fb_story' ? 1920 : 1080, layers: [{ id: 'text', type: 'text', text: contract.cues[0].text, x: 100, y: 100, w: 800, h: 250, zIndex: 1, opacity: 1, rotation: 0, fontFamily: 'Arial', fontSize: 32, color: '#fff', startTime: 0, endTime: 3, animIn: 'none', animOut: 'none' }], customFonts: [] }))
  mocks.measure.mockImplementation(async (input) => {
    validateCopyMeasurementInput(input)
    validateStaticCopy(input)
    expect(input.required[0].clipId).toMatch(/^[a-f0-9]{64}$/)
    expect(input.html).toContain(`data-storyboard-copy-id="${input.required[0].clipId}"`)
    return []
  })
  expect((await run()).findings).toEqual([])
  expect(mocks.measure).toHaveBeenCalledTimes(3)
  if (process.env.STORYBOARD_WRITE_COPY_FIXTURES === 'true') {
    const { writeFileSync } = await import('node:fs')
    writeFileSync('.verification/video-t08/actual-banner-copy-inputs.json', JSON.stringify(mocks.measure.mock.calls.map(([input]) => input), null, 2))
  }
})

it('gives measured default captions an opaque contrast plate and exports actual prepared inputs', async () => {
  state.tracks[0].kind = 'caption'
  state.tracks[0].clips = [{ id: 'o', type: 'caption', text: contract.cues[0].text, timeline_start_sec: 0, duration_sec: 3, style: 'platform_default', source_asset_id: null, caption_vtt_url: null }]
  contract.sources = []
  await run()
  expect(mocks.measure).toHaveBeenCalledTimes(3)
  for (const [input] of mocks.measure.mock.calls) expect(input.html).toContain('background:#000')
  if (process.env.STORYBOARD_WRITE_COPY_FIXTURES === 'true') {
    const { writeFileSync } = await import('node:fs')
    writeFileSync('.verification/video-t08/actual-caption-copy-inputs.json', JSON.stringify(mocks.measure.mock.calls.map(([input]) => input), null, 2))
  }
})
