import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TextLayer from '../../app/components/banner/layers/Text.client.vue'
import { chromium, type Browser } from 'playwright'
import { PNG } from 'pngjs'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as buildServerHTML } from '../../server/utils/banner/htmlBuilder'
import { DEFAULT_TEXT_DEPTH } from '../../shared/bannerEffects'
import type { Layer } from '../../app/types/banner-studio'

const executablePath = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const enabled = process.env.RUN_REAL_BROWSER_TESTS === 'true' && existsSync(executablePath)
const layer = { id: 16, type: 'text', text: 'OPEN SUNDAY', x: 45, y: 60, w: 750, h: 60, zIndex: 1, opacity: 1, fontFamily: 'Arial', fontSize: 64, fontWeight: 800, letterSpacing: '2px', color: '#ff8800' } as Layer
let browser: Browser

describe.skipIf(!enabled)('Native text effects in real Chromium', () => {
  beforeAll(async () => {
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('nextTick', nextTick)
    vi.stubGlobal('useBannerStudio', () => ({ updateLayer: vi.fn() }))
    vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
    browser = await chromium.launch({ executablePath, headless: true })
  })
  afterAll(async () => {
    await browser?.close()
    vi.unstubAllGlobals()
  })
  it('clips opaque AI material to unchanged native glyphs, then adds depth without painting a rectangle', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 220 } })
    const texture = new PNG({ width: 2, height: 2 })
    for (let i = 0; i < texture.data.length; i += 4) texture.data.set([255, 136, 0, 255], i)
    await page.route('https://assets.example.com/material.png', route => route.fulfill({ contentType: 'image/png', body: PNG.sync.write(texture) }))
    const render = async (source: Layer) => {
      const html = buildBannerHTML('custom_900x220', [source], { includeAnimations: false, bgColor: 'transparent' })
      expect(buildServerHTML('custom_900x220', [source], { includeAnimations: false, bgColor: 'transparent' })).toBe(html)
      await page.setContent(html)
      await page.evaluate(() => document.fonts.ready)
      // Wait for background textures, which are not included in document.images.
      if (source.textTexture) await page.evaluate(async (url) => {
        const image = new Image()
        image.src = url
        await image.decode()
      }, source.textTexture)
      return { buffer: await page.screenshot({ omitBackground: true }), font: await page.locator('[data-id="16"]').evaluate(el => getComputedStyle(el).fontFamily) }
    }
    try {
      const plain = await render(layer)
      const textured = await render({ ...layer, textTexture: 'https://assets.example.com/material.png' })
      expect(textured.font).toBe(plain.font)
      const exportHeight = await page.locator('[data-id="16"] > div > div').evaluate(el => el.getBoundingClientRect().height)
      const ink = (buffer: Buffer) => {
        const png = PNG.sync.read(buffer)
        const mask = []
        for (let i = 3; i < png.data.length; i += 4) mask.push(png.data[i] > 32)
        return mask
      }
      const plainInk = ink(plain.buffer), textureInk = ink(textured.buffer)
      const edgeDifferences = plainInk.filter((value, index) => value !== textureInk[index]).length
      // background-clip antialiasing may differ by one pixel around glyph edges.
      expect(edgeDifferences / plainInk.filter(Boolean).length).toBeLessThan(0.01)
      const mounted = await renderToString(createSSRApp(TextLayer, { layer: { ...layer, textTexture: 'https://assets.example.com/material.png' }, isActive: false }))
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.w-full{width:100%}.h-full{height:100%}</style><div style="position:absolute;left:45px;top:60px;width:750px;height:60px">${mounted}</div>`)
      expect(await page.locator('[contenteditable]').evaluate(el => el.getBoundingClientRect().height)).toBe(exportHeight)
      const editorInk = ink(await page.screenshot({ omitBackground: true }))
      expect(editorInk.filter((value, index) => value !== textureInk[index]).length / textureInk.filter(Boolean).length).toBeLessThan(0.01)
      const dimensional = await render({ ...layer, textTexture: 'https://assets.example.com/material.png', textDepth: { ...DEFAULT_TEXT_DEPTH, size: 12 } })
      const dim = PNG.sync.read(dimensional.buffer)
      for (const [x, y] of [[0, 0], [899, 219], [45, 60], [800, 90]]) expect(dim.data[(y * dim.width + x) * 4 + 3]).toBe(0)
      expect(ink(dimensional.buffer).filter(Boolean).length).toBeGreaterThan(ink(plain.buffer).filter(Boolean).length)
      expect(await page.locator('[data-id="16"] img').count()).toBe(0)
      expect(await page.locator('[data-id="16"] [aria-hidden="true"]').count()).toBe(1)
      if (process.env.BANNER_EFFECT_PROOF_PATH) {
        mkdirSync(dirname(process.env.BANNER_EFFECT_PROOF_PATH), { recursive: true })
        await page.screenshot({ omitBackground: true, path: process.env.BANNER_EFFECT_PROOF_PATH })
      }
    } finally { await page.close() }
  }, 30_000)
})
