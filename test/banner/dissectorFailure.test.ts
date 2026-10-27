import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { analyzeImage, segmentLayer } from '../../server/utils/bannerDissector'

const region = { x: 0, y: 0, width: 1, height: 1 }
function png(alpha = 255) {
  const image = new PNG({ width: 2, height: 2 })
  image.data.fill(255)
  image.data[3] = alpha
  return PNG.sync.write(image)
}
function eventWith(result: unknown): H3Event {
  return { context: { cloudflare: { env: { AI: { run: async () => ({ response: JSON.stringify(result) }) } } } } } as unknown as H3Event
}
const validAnalysis = () => ({ brand: 'Fixture', campaign_type: 'offer', layers: [{ type: 'logo', description: 'Logo', region, editable: false }], editable_fields: [] })

beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({}))
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Dissector analysis fails closed', () => {
  it('rejects missing providers instead of inventing layers and commercial copy', async () => {
    await expect(analyzeImage(null, png().toString('base64'))).rejects.toThrow(/analysis.*unavailable|valid.*analysis/i)
  })
  it('rejects provider outages without logging response content', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ geminiApiKey: 'fixture-only', groqApiKey: 'fixture-only' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'private response body' }))
    await expect(analyzeImage(null, png().toString('base64'))).rejects.toThrow(/analysis/i)
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private response body')
  })
  it.each([{}, { layers: [] }, { layers: [{ type: 'made_up', region }] }, { ...validAnalysis(), layers: [{ type: 'logo', region: { ...region, width: 0 } }] }])('rejects invalid analysis: %j', async (result) => {
    await expect(analyzeImage(eventWith(result), png().toString('base64'))).rejects.toThrow(/analysis/i)
  })
  it('retains real detected layers without synthesizing text or price', async () => {
    const result = await analyzeImage(eventWith(validAnalysis()), png().toString('base64'))
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0]).toMatchObject({ type: 'logo', description: 'Logo', region })
    expect(result.tokens).toEqual({})
  })
  it('does not choose the first commercial token when its type occurs more than once', async () => {
    const input = { ...validAnalysis(), layers: [{ type: 'live_text', description: 'Offer $200', region, editable: true }], editable_fields: [{ type: 'price', value: '$100' }, { type: 'price', value: '$200' }] }
    const result = await analyzeImage(eventWith(input), png().toString('base64'))
    expect(result.layers[0]?.token_bindings).not.toContain('token.price')
  })
  it('continues to another available provider when Gemini JSON is malformed', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ geminiApiKey: 'fixture-only' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) }))
    const event = eventWith(validAnalysis())
    event.context.cloudflare.env.GEMINI_API_KEY = 'fixture-only'
    expect((await analyzeImage(event, png().toString('base64'))).layers[0]?.type).toBe('logo')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('Dissector extraction does not mislabel crops as cutouts', () => {
  it('returns unresolved when only a rectangular crop is available', async () => {
    expect(await segmentLayer(null, png(), region, 'logo', 2, 2)).toBeNull()
  })
  it('rejects a mask which just reproduces the whole opaque source', async () => {
    expect(await segmentLayer(null, png(), region, 'logo', 2, 2, png().toString('base64'))).toBeNull()
  })
  it('rejects an empty mask rather than returning an invisible layer', async () => {
    const mask = new PNG({ width: 2, height: 2 })
    mask.data.fill(0)
    expect(await segmentLayer(null, png(), region, 'logo', 2, 2, PNG.sync.write(mask).toString('base64'))).toBeNull()
  })
  it('rejects RMBG output that changes the registered crop dimensions', async () => {
    const shifted = new PNG({ width: 3, height: 3 })
    shifted.data.fill(255)
    shifted.data[3] = 0
    vi.stubGlobal('useRuntimeConfig', () => ({ hfApiToken: 'fixture-only' }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => PNG.sync.write(shifted) }))
    expect(await segmentLayer(null, png(), region, 'logo', 2, 2)).toBeNull()
  })
  it('keeps a real alpha cutout with its registered dimensions', async () => {
    const mask = new PNG({ width: 2, height: 2 })
    mask.data.fill(255)
    mask.data[0] = 0
    const output = await segmentLayer(null, png(), region, 'logo', 2, 2, PNG.sync.write(mask).toString('base64'))
    expect(output).not.toBeNull()
    const decoded = PNG.sync.read(output!)
    expect([decoded.width, decoded.height]).toEqual([2, 2])
    expect(decoded.data[3]).toBe(0)
    expect(decoded.data[7]).toBe(255)
  })
  it('rejects opaque or non-image RMBG responses', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ hfApiToken: 'fixture-only' }))
    for (const response of [png(), Buffer.from('not an image')]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => response }))
      expect(await segmentLayer(null, png(), region, 'logo', 2, 2)).toBeNull()
    }
  })
})

describe('Dissector hosted provider credentials', () => {
  it('reads Groq from the request binding with empty runtime/process configuration', async () => {
    vi.stubEnv('GROQ_API_KEY', '')
    const event = { context: { cloudflare: { env: { GROQ_API_KEY: 'request-groq' } } } } as unknown as H3Event
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(validAnalysis()) } }] }) }))
    expect((await analyzeImage(event, png().toString('base64'))).layers[0]?.type).toBe('logo')
    expect(fetch).toHaveBeenCalledWith('https://api.groq.com/openai/v1/chat/completions', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer request-groq' }) }))
    expect(process.env.GROQ_API_KEY).toBe('')
  })
  it('uses request Gemini credentials for analysis and segmentation', async () => {
    const event = { context: { cloudflare: { env: { GEMINI_API_KEY: 'request-gemini' } } } } as unknown as H3Event
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(validAnalysis()) }] } }] }) }))
    expect((await analyzeImage(event, png().toString('base64'))).layers[0]?.type).toBe('logo')
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2)
    expect(vi.mocked(fetch).mock.calls.every(call => String(call[0]).includes('key=request-gemini'))).toBe(true)
  })
  it('uses request HuggingFace credentials for cutouts', async () => {
    const event = { context: { cloudflare: { env: { HF_API_TOKEN: 'request-hf' } } } } as unknown as H3Event
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => png(0) }))
    expect(await segmentLayer(event, png(), region, 'logo', 2, 2)).not.toBeNull()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('huggingface.co'), expect.objectContaining({ headers: { Authorization: 'Bearer request-hf' } }))
  })
  it('treats an empty hosted binding bag as authoritative over runtime credentials', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ groqApiKey: 'stale-key', geminiApiKey: 'stale-key', hfApiToken: 'stale-key' }))
    const event = { context: { cloudflare: { env: {} } } } as unknown as H3Event
    await expect(analyzeImage(event, png().toString('base64'))).rejects.toThrow(/unavailable/)
    expect(await segmentLayer(event, png(), region, 'logo', 2, 2)).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
