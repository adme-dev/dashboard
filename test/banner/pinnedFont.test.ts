// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableJavaScriptEvaluation":false}}
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, readonly, ref } from 'vue'
import { BANNER_PINNED_FONT as pin, bannerPinnedFontCss } from '../../shared/bannerPinnedFont'
import { buildBannerHTML as clientHtml } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as serverHtml } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

const bytes = readFileSync(resolve('public' + pin.url))
let faces: Set<MockFace>
let fetchMock: ReturnType<typeof vi.fn>
let decode: (face: MockFace) => Promise<MockFace>
let creations = 0
class MockFace {
  status = 'unloaded'
  style: string
  weight: string
  constructor(public family: string, public bytes: ArrayBuffer, descriptors: { weight: string, style: string }) {
    creations++
    this.weight = descriptors.weight
    this.style = descriptors.style
  }

  load() { return decode(this) }
}
const layer = { id: 1, type: 'text', text: 'JOIN US', fontFamily: pin.family, fontWeight: 700, fontSize: 32, lineHeight: 1.2, x: 0, y: 0, w: 500, h: 80, zIndex: 0, opacity: 1, color: '#000000' } as Layer
const response = (data = bytes) => new Response(data, { status: 200 })
const loader = () => import('../../app/utils/banner-pinned-font')

beforeEach(() => {
  vi.resetModules()
  faces = new Set()
  creations = 0
  decode = async (face) => {
    face.status = 'loaded'
    return face
  }
  fetchMock = vi.fn(async () => response())
  Object.defineProperty(document, 'fonts', { configurable: true, value: faces })
  document.head.innerHTML = ''
  for (const [name, value] of Object.entries({ FontFace: MockFace, crypto: webcrypto, fetch: fetchMock, computed, readonly, ref, $fetch: vi.fn(async () => []) })) vi.stubGlobal(name, value)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('platform pinned font bytes and loading', () => {
  it('verifies before creating a face, shares concurrent loads and installs only those exact bytes', async () => {
    const { loadBannerPinnedFont } = await loader()
    const [a, b] = await Promise.all([loadBannerPinnedFont(), loadBannerPinnedFont()])
    expect(a).toBe(b)
    expect(creations).toBe(1)
    expect(Buffer.from((a as unknown as MockFace).bytes)).toEqual(bytes)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(pin.url)
    expect(faces.has(a as unknown as MockFace)).toBe(true)
  })

  it('rejects missing, wrong-length and tampered assets without decoding and permits a later clean retry', async () => {
    const tampered = Buffer.from(bytes)
    tampered[100] ^= 1
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(response(bytes.subarray(1))).mockResolvedValueOnce(response(tampered))
    const { loadBannerPinnedFont } = await loader()
    await expect(loadBannerPinnedFont()).rejects.toThrow('unavailable')
    await expect(loadBannerPinnedFont()).rejects.toThrow('byte length')
    await expect(loadBannerPinnedFont()).rejects.toThrow('checksum')
    expect(creations).toBe(0)
    await expect(loadBannerPinnedFont()).resolves.toHaveProperty('status', 'loaded')
  })

  it('rejects decoding failure and does not install a fallback', async () => {
    decode = async () => {
      throw new Error('Font decoding failed')
    }
    await expect((await loader()).loadBannerPinnedFont()).rejects.toThrow('decoding failed')
    expect(faces.size).toBe(0)
  })

  it('bounds a stalled decoder and rejects a late result without installing it', async () => {
    const { loadBannerPinnedFont } = await loader()
    let finish!: () => void
    let decoding!: () => void
    const reachedDecode = new Promise<void>((resolve) => {
      decoding = resolve
    })
    decode = face => new Promise((resolve) => {
      finish = () => {
        face.status = 'loaded'
        resolve(face)
      }
      decoding()
    })
    vi.useFakeTimers()
    const pending = loadBannerPinnedFont()
    const failed = expect(pending).rejects.toThrow('timed out')
    await reachedDecode
    await vi.advanceTimersByTimeAsync(15001)
    await failed
    finish()
    await Promise.resolve()
    expect(faces.size).toBe(0)
  })

  it.each(['700', 'bold', '100 900'])('rejects a colliding case-insensitive family/weight %s', async (weight) => {
    faces.add(new MockFace('source sans 3', new ArrayBuffer(1), { weight, style: 'normal' }))
    await expect((await loader()).loadBannerPinnedFont()).rejects.toThrow('conflicting')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retains other weights and rejects a face added after successful loading or removal of its verified face', async () => {
    faces.add(new MockFace(pin.family, new ArrayBuffer(1), { weight: '400', style: 'normal' }))
    const { loadBannerPinnedFont } = await loader()
    const face = await loadBannerPinnedFont()
    const collision = new MockFace(pin.family, new ArrayBuffer(1), { weight: '700', style: 'normal' })
    faces.add(collision)
    await expect(loadBannerPinnedFont()).rejects.toThrow('conflicting')
    faces.delete(collision)
    faces.delete(face as unknown as MockFace)
    await expect(loadBannerPinnedFont()).rejects.toThrow('no longer installed')
  })

  it('cancels a caller while shared font loading is pending without accepting a late measurement', async () => {
    let finish!: (response: Response) => void
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => {
      finish = resolve
    }))
    const controller = new AbortController()
    const { measureBannerPinnedText, loadBannerPinnedFont } = await loader()
    const pending = measureBannerPinnedText(layer, 'NEW WORDING', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow()
    finish(response())
    await expect(loadBannerPinnedFont()).resolves.toHaveProperty('status', 'loaded')
    expect(document.body.textContent).not.toContain('NEW WORDING')
  })

  it.each([{ fontWeight: 900 }, { fontStyle: 'italic' }, { textRuns: [] }, { letterSpacing: '-1px' }, { fontSize: 513 }])('rejects unsupported original typography %j before any font fetch', async (change) => {
    await expect((await loader()).measureBannerPinnedText({ ...layer, ...change } as Layer, 'NEW WORDING')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['A\nB', 'A\u0080B', 'A\u0301', '😀', ' '])('rejects unproven or empty text %j', async (text) => {
    await expect((await loader()).measureBannerPinnedText(layer, text)).rejects.toThrow('glyphs')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('existing editor and HTML export integration', () => {
  it('loads the verified face through the existing editor API without Google or custom Bold collisions', async () => {
    const fonts = (await import('../../app/composables/useBannerFonts')).useBannerFonts()
    await fonts.loadFont(pin.family, [700])
    expect(faces.size).toBe(1)
    expect(document.head.querySelector('link')).toBeNull()
    expect(fonts.getExportCustomFonts([layer])).toEqual([{ family: pin.family, url: expect.stringContaining(pin.url), weight: 700, format: 'truetype' }])
    expect(fonts.buildGoogleFontsUrl([layer])).toBe('')
    expect(fonts.buildGoogleFontsUrl([{ ...layer, fontWeight: 400 }])).toContain('wght@400&')
    expect(fonts.searchFonts(pin.family).filter(font => font.family === pin.family)).toHaveLength(1)
  })

  it('reserves only the Bold custom upload while keeping regular and all catalog weights', async () => {
    const upload = (weight: number) => ({ id: weight, name: pin.family, tags: [`weight:${weight}`], url: `https://fonts.example/${weight}.woff2` })
    vi.stubGlobal('$fetch', vi.fn(async () => [upload(700), upload(400)]))
    const fonts = (await import('../../app/composables/useBannerFonts')).useBannerFonts()
    await fonts.refreshCustomFonts()
    expect(document.head.textContent).not.toContain('/700.woff2')
    expect(document.head.textContent).toContain('/400.woff2')
    expect(faces.size).toBe(1)
    expect(fonts.searchFonts(pin.family)).toHaveLength(1)
    expect(fonts.getFont(pin.family)?.weights).toEqual([300, 400, 500, 600, 700, 800, 900])
  })

  it.each([clientHtml, serverHtml])('exports the pinned platform face once, ignoring a conflicting custom Bold URL', (builder) => {
    const html = builder('mrec', [layer], { includeAnimations: false, customFonts: [{ family: pin.family, weight: 700, url: 'https://bad.example/forged.ttf', format: 'truetype' }] })
    expect(html.split(pin.url)).toHaveLength(2)
    expect(html).not.toContain('fonts.googleapis.com')
    expect(html).not.toContain('bad.example')
    expect(html).toContain('font-weight: 700; font-style: normal')
  })

  it('uses the server export origin and preserves non-pinned weights without Google/custom duplication', () => {
    const html = serverHtml('mrec', [layer, { ...layer, id: 2, fontWeight: 400 }], { baseUrl: 'https://app.example', customFonts: [{ family: pin.family, weight: 400, url: 'https://fonts.example/regular.woff2', format: 'woff2' }] })
    expect(html).toContain(`https://app.example${pin.url}`)
    expect(html).toContain('regular.woff2')
    expect(html).not.toContain('fonts.googleapis.com')
    expect(bannerPinnedFontCss([{ fontFamily: 'Arial', fontWeight: 700 }])).toBe('')
  })
})

describe('fresh bounds and unchanged geometry', () => {
  function geometry(change: Partial<TextMetrics> = {}, advance = 100, height = 38.4) {
    const metrics = { width: 100, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 100, actualBoundingBoxAscent: 25, actualBoundingBoxDescent: 5, ...change }
    const context = { measureText: vi.fn(() => metrics) }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return { top: this.tagName === 'SPAN' ? 30 : 0, height: this.tagName === 'SPAN' ? 0 : height, width: 500, left: 0, right: 500, bottom: height, x: 0, y: 0, toJSON: () => ({}) }
    })
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({ width: advance } as DOMRect)
    return context
  }

  it('freshly measures each wording using ink, DOM baseline and line advance without changing the layer', async () => {
    const context = geometry()
    const before = structuredClone(layer)
    const { measureBannerPinnedText } = await loader()
    await expect(measureBannerPinnedText(layer, 'FIRST')).resolves.toEqual({ left: 0, top: 0, right: 100, bottom: 38.4 })
    await expect(measureBannerPinnedText(layer, 'SECOND')).resolves.toEqual({ left: 0, top: 0, right: 100, bottom: 38.4 })
    expect(context.measureText.mock.calls).toEqual([['FIRST'], ['SECOND']])
    expect(layer).toEqual(before)
    expect(document.body.textContent).not.toContain('SECOND')
  })

  it.each([
    [{ actualBoundingBoxLeft: 1 }, 100, 38.4],
    [{ actualBoundingBoxAscent: 31 }, 100, 38.4],
    [{ actualBoundingBoxRight: 501 }, 100, 38.4],
    [{ actualBoundingBoxDescent: 51 }, 100, 38.4],
    [{ width: 501 }, 100, 38.4],
    [{}, 501, 38.4],
    [{}, 100, 81],
    [{ actualBoundingBoxRight: NaN }, 100, 38.4]
  ])('rejects ink overhang, trailing advance, oversized linebox or invalid geometry %j', async (metrics, advance, height) => {
    geometry(metrics, advance, height)
    await expect((await loader()).measureBannerPinnedText(layer, ' WORDING ')).rejects.toThrow('unchanged layer bounds')
    expect(document.body.textContent).not.toContain(' WORDING ')
  })
})
