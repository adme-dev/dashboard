import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadableStream } from 'node:stream/web'
import { attachBannerProofVideo, bannerProofVideoOptions, matchesProofArtwork } from '~~/server/utils/banner/proofVideo'
import { bannerShareVideoPlans } from '~~/server/utils/banner/shareVideo'
import type { ArtboardState } from '~~/app/types/banner-studio'

const m = vi.hoisted(() => ({ load: vi.fn(), rows: vi.fn(), one: vi.fn(), auth: vi.fn(), head: vi.fn(), get: vi.fn(), put: vi.fn() }))
vi.mock('~~/server/utils/banner/teamPreview', () => ({ teamBannerPreviewAccess: () => ({ load: m.load }) }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: m.rows, queryOneFresh: m.one }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: m.auth }))
const bannerId = '11111111-1111-4111-8111-111111111111', clientId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333', jobId = '44444444-4444-4444-8444-444444444444'
const key = `media/${projectId}/${jobId}/reels_9x16.mp4`
const share = { project: { id: bannerId, name: 'Suzuki', clientId, clientName: 'Suzuki', canvasData: { custom_1080x1920: { playback: { duration: 40.18, loopCount: 0 }, layers: [{ id: 1, type: 'video', startTime: 0, endTime: 40.18 }] } as ArtboardState } }, fonts: [] }
const plan = () => bannerShareVideoPlans(share)[0]!
const state = () => ({ width: 1080, height: 1920, duration_sec: 40.18, tracks: [{ kind: 'overlay', clips: [{ type: 'overlay', gsap_project_id: bannerId, gsap_format_key: plan().key, timeline_start_sec: 0, duration_sec: 40.18 }] }] })
const row = () => ({ jobId, projectId, clientId, title: 'Suzuki render', createdAt: '2026-11-22', state: state(), variants: { reels_9x16: key } })
const event = { context: { cloudflare: { env: { MEDIA_BUCKET: { head: m.head, get: m.get, put: m.put } } } } } as never
const input = () => ({ id: `${jobId}:reels_9x16`, revision: plan().revision })
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ id: 'producer' })
  m.load.mockResolvedValue(structuredClone(share))
  m.rows.mockImplementation(async sql => sql.includes('FROM media_render_jobs') ? [row()] : [])
  m.one.mockImplementation(async sql => sql.startsWith('SELECT created_by') ? { created_by: 'owner' } : { id: plan().id })
  m.head.mockResolvedValue({ size: 4, httpEtag: 'etag', httpMetadata: { contentType: 'video/mp4' } })
  m.get.mockImplementation(async () => ({ size: 4, httpEtag: 'etag', body: new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array([1, 2, 3, 4]))
    controller.close()
  } }) }))
})

describe('full-length rendered client proof', () => {
  it('offers only matching client, full-frame current-render candidates without exposing storage keys', async () => {
    const result = await bannerProofVideoOptions(event)
    expect(result).toMatchObject({ required: true, ready: false, options: [{ id: input().id, duration: 40.18 }] })
    expect(JSON.stringify(result)).not.toContain(key)
    expect(m.rows.mock.calls[0][0]).toContain('t.state = draft.state')
    expect(m.rows.mock.calls[0][1]).toEqual([clientId])
  })
  it.each(['client', 'key', 'format', 'duration', 'placement', 'extra-visual'])('rejects a mismatched %s', async (kind) => {
    const candidate = row()
    if (kind === 'client') candidate.clientId = 'other'
    if (kind === 'key') candidate.variants.reels_9x16 = `media/other/${jobId}/reels_9x16.mp4`
    if (kind === 'format') candidate.state.width = 1920
    if (kind === 'duration') candidate.state.duration_sec = 30
    if (kind === 'placement') Object.assign(candidate.state.tracks[0]!.clips[0]!, { placement: { scale: 0.5 } })
    if (kind === 'extra-visual') candidate.state.tracks.push({ kind: 'video', clips: [{} as never] })
    m.rows.mockResolvedValue([candidate])
    await expect(attachBannerProofVideo(event, input())).rejects.toMatchObject({ statusCode: 409 })
    expect(m.put).not.toHaveBeenCalled()
  })
  it('copies the pinned MP4 privately and publishes only its current saved revision', async () => {
    const result = await attachBannerProofVideo(event, input())
    expect(result.revision).toBe(plan().revision)
    expect(m.auth).toHaveBeenCalled()
    expect(m.get).toHaveBeenCalledWith(key)
    expect(m.put.mock.calls[0][0]).toMatch(new RegExp(`^banner-videos/${bannerId}/${plan().id}-studio-`))
    expect(m.put.mock.calls[0][1]).toBeInstanceOf(ReadableStream)
    const manifest = JSON.parse(new TextDecoder().decode(m.put.mock.calls[1][1]))
    expect(manifest).toMatchObject({ revision: plan().revision, jobId, etag: 'etag', attachedBy: 'producer' })
    expect(m.one.mock.calls.at(-1)![0]).toContain('source_r2_key ~ $9')
  })
  it('refuses stale selection, denied writes, moved input media and artwork edits during copy', async () => {
    await expect(attachBannerProofVideo(event, { ...input(), revision: 'old' })).rejects.toMatchObject({ statusCode: 409 })
    m.auth.mockRejectedValueOnce({ statusCode: 403 })
    await expect(attachBannerProofVideo(event, input())).rejects.toMatchObject({ statusCode: 403 })
    m.get.mockResolvedValueOnce({ size: 4, httpEtag: 'new', body: {} })
    await expect(attachBannerProofVideo(event, input())).rejects.toMatchObject({ statusCode: 409 })
    const changed = structuredClone(share)
    changed.project.canvasData.custom_1080x1920.layers[0]!.endTime = 42
    m.load.mockResolvedValueOnce(share).mockResolvedValueOnce(changed)
    await expect(attachBannerProofVideo(event, input())).rejects.toMatchObject({ statusCode: 409 })
    expect(m.one).not.toHaveBeenCalled()
  })
  it.each([{ size: 0 }, { size: 129 * 1024 * 1024 }, { httpMetadata: { contentType: 'text/html' } }])('rejects unavailable or unsuitable stored media %j', async (bad) => {
    m.head.mockResolvedValue({ size: 4, httpEtag: 'etag', httpMetadata: { contentType: 'video/mp4' }, ...bad })
    await expect(attachBannerProofVideo(event, input())).rejects.toMatchObject({ statusCode: 422 })
    expect(m.put).not.toHaveBeenCalled()
  })
  it('keeps a changed timeline, wrong artwork and different format out of the companion match', () => {
    const s = state()
    s.tracks[0]!.clips[0]!.gsap_project_id = 'other'
    expect(matchesProofArtwork(s, bannerId, plan())).toBe(false)
  })
})
