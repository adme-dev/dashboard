import { describe, expect, it } from 'vitest'
import { parseTheBriefPackage, importTags } from '../../app/utils/thebrief-import'
import { reelmotionVideoTimeline, createReelmotionVideoDraft } from '../../app/utils/video/reelmotionImport'

const clientId = '11111111-1111-4111-8111-111111111111'
function fixture() {
  return {
    kind: 'xeroflow-reelmotion-import', version: 1, name: 'Dealer reel draft',
    source: { designHash: 'reel-123-v1', sha256: 'a'.repeat(64), folder: 'ReelMotion', duration: 38.4, loopCount: 0 },
    reelmotion: { lastSpokenWordEndSec: 35.2, endCardStartSec: 35.6, headClashes: 0, faceSampleFps: 6 },
    canvasData: { custom_1080x1920: { playback: { duration: 38.4, loopCount: 0 }, layers: [{ id: 1, type: 'text', name: 'Caption', text: 'Recorded words', x: 65, y: 1075, w: 850, h: 70, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 38.4 }] } },
    warnings: [], assets: [], fonts: []
  }
}
describe('prepared ReelMotion import', () => {
  it('preserves real source provenance without claiming a TheBrief migration', () => {
    const pkg = parseTheBriefPackage(fixture())
    expect(importTags(pkg)).toContain('source:reelmotion')
    expect(importTags(pkg)).not.toContain('source:thebrief')
  })
  it('requires sampled head QA and enough room after speech for the end card', () => {
    for (const metadata of [undefined, { ...fixture().reelmotion, headClashes: 1 }, { ...fixture().reelmotion, faceSampleFps: 0 }, { ...fixture().reelmotion, lastSpokenWordEndSec: 35.7 }, { ...fixture().reelmotion, endCardStartSec: 37 }]) {
      expect(() => parseTheBriefPackage({ ...fixture(), reelmotion: metadata })).toThrow()
    }
  })
  it('rejects missing playback before any upload', () => {
    const input = fixture(); delete (input.canvasData.custom_1080x1920 as any).playback
    expect(() => parseTheBriefPackage(input)).toThrow(/playback/i)
  })
  it('allows caption-heavy portrait reels but keeps the TheBrief layer budget', () => {
    const input = fixture()
    input.canvasData.custom_1080x1920.layers = Array.from({ length: 300 }, (_, index) => ({ ...input.canvasData.custom_1080x1920.layers[0], id: index + 1 }))
    expect(parseTheBriefPackage(input).canvasData.custom_1080x1920.layers).toHaveLength(300)
    expect(() => parseTheBriefPackage({ ...input, kind: 'xeroflow-thebrief-import' })).toThrow(/200/)
    expect(() => parseTheBriefPackage({ ...input, source: { ...input.source, duration: 91 } })).toThrow()
    expect(() => parseTheBriefPackage({ ...input, canvasData: { custom_1920x1080: input.canvasData.custom_1080x1920 } })).toThrow()
  })
})
describe('native ReelMotion companion', () => {
  const project = () => ({ id: 'banner-id', clientId, canvasData: { custom_1080x1920: { playback: { duration: 38.4, loopCount: 0 }, layers: [
    { type: 'video', src: 'https://app.xeroflow.io/video', startTime: 0, endTime: 38.4 },
    { type: 'audio', src: 'https://app.xeroflow.io/voice', startTime: 0, endTime: 38.4, volume: 0.5 }
  ] } } })
  const assets = [{ id: 'voice', url: 'https://app.xeroflow.io/voice', r2Key: 'banner-assets/owner/voice.mp3', clientId, mimeType: 'audio/mpeg' }]
  it('builds a native overlay and independent audio with the saved duration and gain', () => {
    const state = reelmotionVideoTimeline(project(), assets)
    expect(state.duration_sec).toBe(38.4)
    expect(state.tracks.find(t => t.kind === 'overlay')?.clips[0]).toMatchObject({ gsap_project_id: 'banner-id', gsap_format_key: 'custom_1080x1920', duration_sec: 38.4 })
    expect(state.tracks.find(t => t.kind === 'voiceover')?.clips[0]).toMatchObject({ r2_key: assets[0].r2Key, source_out_sec: 38.4, gain_db: -6.020599913279624 })
  })
  it('rejects unknown/cross-client audio and unsupported timing rather than making a silent export', () => {
    expect(() => reelmotionVideoTimeline(project(), [])).toThrow(/audio/i)
    expect(() => reelmotionVideoTimeline(project(), [{ ...assets[0], clientId: 'other' }])).toThrow(/audio/i)
    const p = project(); p.canvasData.custom_1080x1920.playback.duration = 91
    expect(() => reelmotionVideoTimeline(p, assets)).toThrow(/duration/i)
  })
  it('creates with stable identity and verifies persistence before returning an editor link', async () => {
    const calls: Array<{ url: string, options?: any }> = []
    let state: unknown
    const api = async (url: string, options?: any): Promise<any> => {
      calls.push({ url, options })
      if (url.includes('banner-studio/projects/')) return { ...project(), status: 'draft', name: 'Reel draft', tags: ['source:reelmotion'] }
      if (url.includes('banner-studio/assets?')) return { assets }
      if (options?.method === 'POST') { state = options.body.initialState; return { project: { id: 'video-id' }, timeline: { state } } }
      return { project: { id: 'video-id', clientId, mediaType: 'av' }, timeline: { state } }
    }
    expect(await createReelmotionVideoDraft('banner-id', clientId, api)).toBe('video-id')
    expect(calls.find(c => c.options?.method === 'POST')?.options.headers['Idempotency-Key']).toBe('reelmotion-video:banner-id')
    await expect(createReelmotionVideoDraft('banner-id', 'wrong-client', api)).rejects.toThrow(/client/i)
  })
  it('opens a recovered companion with its saved edits intact', async () => {
    const edited = { edited: 'A later saved cut' }
    const api = async (url: string, options?: { method?: string }): Promise<any> => {
      if (url.includes('banner-studio/projects/')) return { ...project(), status: 'draft', name: 'Reel draft', tags: ['source:reelmotion'] }
      if (url.includes('banner-studio/assets?')) return { assets }
      return { project: { id: 'saved-id', clientId, mediaType: 'av' }, timeline: { state: edited } }
    }
    expect(await createReelmotionVideoDraft('banner-id', clientId, api)).toBe('saved-id')
  })
})
