import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, reactive, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { chromium, type Browser, type Page } from 'playwright'
import { PNG } from 'pngjs'
import ImageLayer from '../../app/components/banner/layers/Image.client.vue'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as buildServerHTML } from '../../server/utils/banner/htmlBuilder'
import type { BannerProject } from '../../app/types/banner-studio'

const executablePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const enabled = process.env.RUN_REAL_BROWSER_TESTS === 'true' && existsSync(executablePath)
const out = resolve('output/editable-artwork-pilot/decomposition')
let browser: Browser, decoder: Page
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
vi.stubGlobal('useBannerStudio', useBannerStudio)
vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
const fetcher = vi.fn()
vi.stubGlobal('$fetch', fetcher)
const { useDecompose } = await import('../../app/composables/useDecompose')

// Exercise browser image decoding from the real composable running in the test process.
class BrowserImage {
  onload?: () => void
  onerror?: () => void
  naturalWidth = 0
  naturalHeight = 0
  set src(url: string) {
    decoder.evaluate(async (src) => {
      const image = new Image()
      image.src = src
      await image.decode()
      return { width: image.naturalWidth, height: image.naturalHeight }
    }, url).then((size) => {
      this.naturalWidth = size.width
      this.naturalHeight = size.height
      this.onload?.()
    }, () => this.onerror?.())
  }
}
function fixture(kind: 'source' | 'background' | 'foreground') {
  const png = new PNG({ width: 240, height: 120 })
  for (let y = 0; y < 120; y++) for (let x = 0; x < 240; x++) {
    const foreground = x >= 80 && x < 160 && y >= 30 && y < 90
    png.data.set(kind !== 'background' && foreground
      ? [220, 30, 40, 255]
      : kind === 'foreground' ? [0, 0, 0, 0] : [20, 180, 90, 255], (y * 240 + x) * 4)
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}
const source = fixture('source'), background = fixture('background'), foreground = fixture('foreground')

describe.skipIf(!enabled)('Synthetic raster decomposition in Chromium (no live model)', () => {
  beforeAll(async () => {
    mkdirSync(out, { recursive: true })
    browser = await chromium.launch({ executablePath, headless: true })
    decoder = await browser.newPage()
    await decoder.route('http{,s}://**/*', route => route.abort())
    vi.stubGlobal('Image', BrowserImage)
  })
  afterAll(async () => {
    await browser?.close()
    vi.unstubAllGlobals()
  })

  it.each(['cover', 'crop'])('preserves %s registration through import, visibility, undo and file-backed save/reload', async (mode) => {
    const studio = useBannerStudio()
    const project = { id: 'synthetic-decomposition', name: 'Synthetic raster proof', canvasData: { mrec: { layers: [
      { id: 1, type: 'image', name: 'Synthetic source', src: source, x: 30, y: 40, w: 180, h: 120, fit: 'cover',
        ...(mode === 'crop' ? { imageCrop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } } : {}),
        zIndex: 1, opacity: 1, animIn: 'none', animOut: 'none', startTime: 0, endTime: 5 }
    ] } } } as BannerProject
    studio.loadProject(project)
    const original = studio.getCanvasData()
    const page = await browser.newPage({ viewport: { width: 300, height: 250 }, deviceScaleFactor: 1 })
    await page.route('http{,s}://**/*', route => route.abort())
    const render = async (name: string, editor = false) => {
      const layers = studio.activeLayers.value
      let html = buildBannerHTML('mrec', layers, { includeAnimations: false, bgColor: '#ffffff' })
      expect(html).toBe(buildServerHTML('mrec', layers, { includeAnimations: false, bgColor: '#ffffff' }))
      if (editor) {
        const nodes = await Promise.all(layers.filter(l => !l.hidden).map(async layer =>
          `<div style="position:absolute;left:${layer.x}px;top:${layer.y}px;width:${layer.w}px;height:${layer.h}px;z-index:${layer.zIndex}">${await renderToString(createSSRApp(ImageLayer, { layer, isActive: false }))}</div>`))
        html = `<style>*{box-sizing:border-box}body{margin:0;background:white}.relative{position:relative}.w-full{width:100%}.h-full{height:100%}.overflow-hidden{overflow:hidden}</style>${nodes.join('')}`
      }
      await page.setContent(html)
      await page.evaluate(async () => {
        await Promise.all([...document.images].map(image => image.decode()))
      })
      const screenshot = await page.screenshot({ path: `${out}/${mode}-${name}.png` })
      return PNG.sync.read(screenshot)
    }
    const originalPixels = await render('source')
    studio.updateLayer(1, { opacity: 0.5 })
    const halfOpacity = await render('half-opacity-source')
    fetcher.mockClear()
    expect(await useDecompose().decomposeFromUrl(source, 'Synthetic source', 1, 'layer')).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
    expect((await render('half-opacity-rejected')).data.equals(halfOpacity.data)).toBe(true)
    studio.undo()
    fetcher.mockImplementation(async (url: string, options: { body: unknown }) => {
      if (url.endsWith('/decompose')) return { status: 'complete', expectedLayerCount: 2, layers: [
        { name: 'Background', url: background, width: 240, height: 120, r2Key: 'synthetic-bg' },
        { name: 'Foreground', url: foreground, width: 240, height: 120, r2Key: 'synthetic-fg' }
      ], pptxUrl: null, zipUrl: null }
      writeFileSync(`${out}/${mode}-saved.json`, JSON.stringify({ ...project, ...options.body as object }))
      return {}
    })
    expect(await useDecompose().decomposeFromUrl(source, 'Synthetic source', 1, 'layer')).toBe(true)
    expect(studio.activeLayers.value.find(l => l.id === 1)?.hidden).toBe(true)
    expect((await render('imported')).data.equals(originalPixels.data)).toBe(true)
    expect((await render('editor', true)).data.equals(originalPixels.data)).toBe(true)
    studio.undo()
    expect(studio.getCanvasData()).toEqual(original)
    expect((await render('undone')).data.equals(originalPixels.data)).toBe(true)
    studio.redo()
    const fg = studio.activeLayers.value.find(l => l.src === foreground)!
    studio.updateLayer(fg.id, { hidden: true })
    const hidden = await render('foreground-hidden')
    expect([...hidden.data.subarray((100 * hidden.width + 120) * 4, (100 * hidden.width + 120) * 4 + 4)]).toEqual([20, 180, 90, 255])
    studio.undo()
    expect((await render('foreground-revealed')).data.equals(originalPixels.data)).toBe(true)
    await studio.saveProject()
    studio.loadProject(JSON.parse(readFileSync(`${out}/${mode}-saved.json`, 'utf8')))
    expect((await render('reopened')).data.equals(originalPixels.data)).toBe(true)
    expect(studio.activeLayers.value.filter(l => !l.hidden).every(l => l.type === 'image')).toBe(true)
    writeFileSync(`${out}/${mode}-evidence.json`, JSON.stringify({ browser: 'Chromium', syntheticRgbaOnly: true, liveProviderAcceptance: false, imageLoading: 'Chromium decode bridge', saveReload: 'file-backed real saveProject payload', editorExportPixelParity: true, sharedFrameRegistration: true, undoPixelsIdentical: true, hideReveal: true, halfOpacityRejectedBeforeInference: true }, null, 2))
    await page.close()
  }, 30000)
})
