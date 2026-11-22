import { describe, expect, it, vi } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'
import { buildCompositePlan, buildCompositeRenderArgs } from '~~/server/utils/audio/videoCompositeGraph'
import * as container from '../../workers/audio-jobs/container/videoCompositeGraph.mjs'
import { renderComposite } from '../../workers/audio-jobs/src/videoCompositeContainer'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@cloudflare/containers', () => ({
  getContainer: () => ({ fetch: post })
}))
vi.mock('../../workers/audio-jobs/src/compositeOutputStream', () => ({ putCompositeOutput: vi.fn() }))

const profile = videoFormatFor('reels_9x16')!
const state = TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', tracks: [
  { id: 'art', name: 'Art', kind: 'overlay', clips: [
    { id: 'art', type: 'overlay', gsap_project_id: 'banner', timeline_start_sec: 0, duration_sec: 5 }
  ] },
  { id: 'voice', name: 'Narration', kind: 'voiceover', clips: [
    { id: 'voice', r2_key: 'voice.wav', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 5 }
  ] }
] })
const source = { r2Key: 'banner-assets/managed.mp4', size: 3, etag: 'asset-version' }
const zoom = [{ timeSec: 0, scale: 1 }, { timeSec: 2.99, scale: 1.05 }, { timeSec: 3, scale: 1 }]
const clip = { clipId: 'art', timeline_start_sec: 0, duration_sec: 5 }
const base = { version: 1 as const, source, graphicsHtmlKey: 'media/p/j/reels_9x16/overlay-art-graphics.html', zoom }
const frames = { ...clip, framesPattern: 'art/%05d.png', fps: 30, baseFootage: { r2Key: source.r2Key, zoom } }
const overlay = { ...clip, htmlKey: 'media/p/j/reels_9x16/overlay-art.html', baseFootage: base }
function mockBucket(etag = source.etag, size = source.size, snapshot = '<video src="managed"></video>') {
  const read = vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer)
  const get = vi.fn(async (key: string) => ({
    size: key === source.r2Key ? size : 3, etag,
    arrayBuffer: key.endsWith('/overlay-art.html') ? async () => new TextEncoder().encode(snapshot).buffer : read, text: async () => ''
  }))
  return { read, get, env: { RENDER: {} as any, AUDIO_BUCKET: { get, put: vi.fn() } } }
}
const args = { projectId: 'p', jobId: 'j', profile, state, resolvedOverlays: [overlay] }

describe('managed base footage in an artwork composite', () => {
  it('puts the footage before voice and graphics, preserving the individual input clocks', () => {
    const plan = buildCompositePlan(state, profile, [frames])
    expect(container.buildCompositePlan(state, profile, [frames])).toEqual(plan)
    expect(plan.inputs.map(i => i.r2_key)).toEqual([source.r2Key, 'voice.wav'])
    expect(plan.filterComplex).toContain('[1:a]')
    expect(plan.filterComplex).toContain('[2:v]')
    expect(plan.filterComplex).toContain('zoompan=')
    expect(plan.filterComplex).toContain('stop_mode=clone')
    expect(() => buildCompositeRenderArgs(plan, ['base','voice'], 'out.mp4')).toThrow(/start time/)
    const ff = buildCompositeRenderArgs(plan, ['base','voice'], 'out.mp4', 0.033008)
    expect(container.buildCompositeRenderArgs(plan, ['base','voice'], 'out.mp4', 0.033008)).toEqual(ff)
    expect(ff.slice(ff.indexOf('-itsoffset'), ff.indexOf('-itsoffset') + 6)).toEqual(['-itsoffset','0.033008','-i','base','-i','voice'])
  })
  it('rejects invalid scale values before creating an FFmpeg expression', () => {
    const bad = { ...frames, baseFootage: { ...frames.baseFootage, zoom: [{ timeSec: 0, scale: NaN }] } }
    expect(() => container.buildCompositePlan(state, profile, [bad])).toThrow(/zoom/)
  })
  it('reads the pinned R2 object and graphics HTML in place of the whole artwork', async () => {
    const { get, env } = mockBucket()
    post.mockReset().mockResolvedValue(new Response('mp4'))
    await renderComposite(env, args)
    expect(get.mock.calls.map(([key]) => key)).toEqual([source.r2Key, 'voice.wav', base.graphicsHtmlKey])
    const sent = JSON.parse(post.mock.calls[0]![1].body)
    expect(sent.plan.inputs[0].r2_key).toBe(source.r2Key)
    expect(sent.files).toHaveLength(2)
  })
  it.each(['square_1x1', 'youtube_16x9'] as const)('fits the completed native picture into %s and retains a fitted whole-artwork fallback', async format => {
    const output = videoFormatFor(format)!
    const htmlKey = overlay.htmlKey.replace('reels_9x16', format)
    const containedPortraitFootage = { ...base, graphicsHtmlKey: base.graphicsHtmlKey.replace('reels_9x16', format) }
    const { env } = mockBucket()
    post.mockReset().mockResolvedValueOnce(new Response(null, { status: 422, headers: { 'x-reelmotion-base': 'unsupported' } }))
      .mockResolvedValueOnce(new Response('mp4'))
    await renderComposite(env, { ...args, profile: output, resolvedOverlays: [{ ...clip, htmlKey, containedPortraitFootage }] })
    const [split, fallback] = post.mock.calls.map(([, init]) => JSON.parse(init.body))
    expect(split.overlays[0]).toMatchObject({ width: 1080, height: 1920 })
    expect(split.plan.filterComplex).toContain('s=1080x1920:fps=30')
    expect(split.plan.filterComplex).toContain(`[vout]scale=-2:1080,setsar=1,pad=${output.width}:1080:(ow-iw)/2:0[contained]`)
    expect(split.plan).toMatchObject({ profile: output, vLabel: '[contained]' })
    expect(fallback.overlays[0]).toMatchObject({ width: output.width, height: output.height, html: '<video src="data:video/mp4;base64,AQID"></video>' })
    expect(fallback.plan.inputs.map((input: { r2_key: string }) => input.r2_key)).toEqual(['voice.wav'])
    expect(fallback.plan.vLabel).toBe('[vout]')
  })
  it('rejects changed output dimensions and mixed split descriptors before any storage read', async () => {
    const { env, get } = mockBucket()
    const output = videoFormatFor('square_1x1')!
    const htmlKey = overlay.htmlKey.replace('reels_9x16', output.format)
    const containedPortraitFootage = { ...base, graphicsHtmlKey: base.graphicsHtmlKey.replace('reels_9x16', output.format) }
    const item = { ...clip, htmlKey, containedPortraitFootage }
    await expect(renderComposite(env, { ...args, profile: { ...output, width: 1920 }, resolvedOverlays: [item] })).rejects.toThrow('Invalid contained portrait output')
    await expect(renderComposite(env, { ...args, profile: output, resolvedOverlays: [{ ...item, baseFootage: base }] })).rejects.toThrow('Invalid contained portrait output')
    await expect(renderComposite(env, { ...args, profile: output, pinnedObjects: [], resolvedOverlays: [{ ...item, requiredCopy: [{} as never] }] })).rejects.toThrow(/immutable/)
    expect(get).not.toHaveBeenCalled()
  })
  it.each([['changed', 3], [source.etag, 4]] as const)('rejects changed ETag/size before reading footage bytes', async (etag, size) => {
    const { env, read } = mockBucket(etag, size)
    await expect(renderComposite(env, args)).rejects.toThrow(/footage.*changed/i)
    expect(read).not.toHaveBeenCalled()
  })
  it.each([
    { ...base, version: 2 },
    { ...base, graphicsHtmlKey: 'media/other/overlay-art-graphics.html' },
    { ...base, source: { ...source, r2Key: 'unscoped.mp4' } },
    { ...base, source: { ...source, r2Key: 'banner-assets/../voice.wav' } },
    { ...base, source: { ...source, size: 16 * 1024 * 1024 + 1 } }
  ])('refuses an unsupported descriptor before reading R2', async invalid => {
    const { env, get } = mockBucket()
    await expect(renderComposite(env, { ...args, resolvedOverlays: [{ ...overlay, baseFootage: invalid as typeof base }] })).rejects.toThrow(/descriptor/)
    expect(get).not.toHaveBeenCalled()
  })
  it('renders the original artwork once on unsupported media using the same request budget', async () => {
    const { env, get } = mockBucket()
    post.mockReset()
      .mockResolvedValueOnce(new Response(null, { status: 422, headers: { 'x-reelmotion-base': 'unsupported' } }))
      .mockResolvedValueOnce(new Response('mp4'))
    await renderComposite(env, args)
    expect(get.mock.calls.map(([key]) => key)).toEqual([source.r2Key, 'voice.wav', base.graphicsHtmlKey, overlay.htmlKey])
    const body = JSON.parse(post.mock.calls[1]![1].body)
    expect(body.overlays[0].html).toBe('<video src="data:video/mp4;base64,AQID"></video>')
    expect(body.files).toHaveLength(1)
    expect(post.mock.calls[0]![1].signal).toBe(post.mock.calls[1]![1].signal)
    expect(post.mock.calls[0]![1].headers['x-render-execution-id']).not.toBe(post.mock.calls[1]![1].headers['x-render-execution-id'])
    expect(Number(post.mock.calls[1]![1].headers['x-render-timeout-ms'])).toBeLessThanOrEqual(Number(post.mock.calls[0]![1].headers['x-render-timeout-ms']))
  })
  it.each([
    '<video src="one"></video><video src="two"></video>',
    '<video src="one" src="two"></video>',
    '<video src="one"><source src="two"></video>',
    '<video></video>'
  ])('rejects ambiguous footage in the original snapshot', async snapshot => {
    const { env } = mockBucket(source.etag, source.size, snapshot)
    post.mockReset().mockResolvedValue(new Response(null, { status: 422, headers: { 'x-reelmotion-base': 'unsupported' } }))
    await expect(renderComposite(env, args)).rejects.toThrow(/whole-artwork footage/)
    expect(post).toHaveBeenCalledTimes(1)
  })
  it.each([422, 500])('propagates unrelated container status %s without loading fallback HTML', async status => {
    const { env, get } = mockBucket()
    post.mockReset().mockResolvedValue(new Response(null, { status }))
    await expect(renderComposite(env, args)).rejects.toThrow(`composite render failed: ${status}`)
    expect(post).toHaveBeenCalledTimes(1)
    expect(get).not.toHaveBeenCalledWith(overlay.htmlKey)
  })
  it('propagates a failed whole-artwork fallback after exactly one retry', async () => {
    const { env } = mockBucket()
    post.mockReset().mockImplementation(() => new Response(null, { status: 422, headers: { 'x-reelmotion-base': 'unsupported' } }))
    await expect(renderComposite(env, args)).rejects.toThrow('composite render failed: 422')
    expect(post).toHaveBeenCalledTimes(2)
  })
  it('rejects split footage on a pinned storyboard job before any object read', async () => {
    const { env, get } = mockBucket()
    await expect(renderComposite(env, { ...args, pinnedObjects: [], resolvedOverlays: [{ ...overlay, requiredCopy: [{} as any] }] })).rejects.toThrow(/immutable/)
    expect(get).not.toHaveBeenCalled()
  })
})
