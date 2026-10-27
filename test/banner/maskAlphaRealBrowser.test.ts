import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeClipPath, computeClipPathPx, computeAnimatedClipPath } from '../../app/utils/banner-mask'
import { computeClipPathPx as serverClip } from '../../server/utils/banner/mask'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const enabled = process.env.RUN_REAL_BROWSER_TESTS === 'true' && existsSync(chrome)
const out = 'output/editable-artwork-animation/mask-pixels'
let browser: Browser
const png = new PNG({ width: 120, height: 120 })
// Nonzero RGB under zero alpha catches accidental opaque flattening; intermediate
// alpha bands catch binary-mask conversion and double opacity multiplication.
for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
  png.data.set([240, 80, 20, [0, 64, 128, 255][Math.floor(x / 30)]!], (y * 120 + x) * 4)
}
const src = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
const target = { x: 0, y: 0, w: 120, h: 120 }
const bounds = { x: 25, y: 25, w: 70, h: 70 }
const points = [[10, 60], [40, 60], [70, 60], [100, 60], [70, 10], [70, 110]]

describe.skipIf(!enabled)('decoded PNG alpha and geometric masks in Chromium', () => {
  beforeAll(async () => {
    mkdirSync(out, { recursive: true })
    writeFileSync(`${out}/soft-alpha-source.png`, PNG.sync.write(png))
    browser = await chromium.launch({ executablePath: chrome, headless: true })
  }, 60000)
  afterAll(async () => {
    await browser?.close()
  }, 60000)

  it.each(['none', 'rect', 'ellipse', 'rect-inverted', 'ellipse-inverted'] as const)('%s preserves soft alpha through static and animated exports', async (mode) => {
    const shape = mode.startsWith('ellipse') ? 'ellipse' : 'rect'
    const invert = mode.endsWith('inverted')
    const image = { ...target, id: 1, type: 'image', name: 'Soft alpha', src, opacity: 0.5, zIndex: 1,
      fit: 'fill', startTime: 0, endTime: 5, animIn: 'none', animOut: 'none' } as Layer
    const mask = { ...bounds, id: 2, type: 'rect', name: 'Mask', opacity: 1, zIndex: 2,
      isMask: true, maskShape: shape, maskInvert: invert, maskTargetIds: [1],
      startTime: 0, endTime: 5, animIn: 'none', animOut: 'none',
      keyframes: { x: [{ time: 0, value: 0, easing: 'none' }, { time: 5, value: 20, easing: 'none' }] } } as Layer
    const layers = mode === 'none' ? [image] : [image, mask]
    const page = await browser.newPage({ viewport: { width: 300, height: 250 }, deviceScaleFactor: 1 })
    await page.route('**/*', route => route.abort())
    const receipts = []
    try {
      for (const variant of ['editor-clip', 'static-export', 'animated-export'] as const) {
        for (const time of variant === 'animated-export' ? [0, 2.5, 0] : [0]) {
          const animated = variant === 'animated-export'
          let html = client('mrec', layers, { includeAnimations: animated, bgColor: '#ffffff' })
          expect(server('mrec', layers, { includeAnimations: animated, bgColor: '#ffffff' })).toBe(html)
          if (variant === 'editor-clip') {
            const clip = mode === 'none' ? 'none' : computeClipPath(bounds, target, shape, invert)
            html = `<style>body{margin:0;background:white}img{width:120px;height:120px;opacity:.5;clip-path:${clip}}</style><img src="${src}">`
          }
          html = html.replace(/<script src="https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/gsap\/[^/]+\/([^"/]+)"><\/script>/g,
            (_all, file) => `<script>${readFileSync(resolve('node_modules/gsap/dist', file), 'utf8').replaceAll('</script', '<\\/script')}</script>`)
          // Each exported document has global timeline declarations. Navigate to
          // reset the JS realm between documents, as a real export tab does.
          await page.goto('about:blank')
          await page.setContent(html)
          await page.evaluate(async () => {
            await Promise.all([...document.images].map(i => i.decode()))
          })
          if (animated) await page.evaluate((t) => {
            const w = window as unknown as { __engagrTimeline: { pause(): { seek(t: number, suppress: boolean): void } }, __engagrUpdateMasks(): void }
            w.__engagrTimeline.pause().seek(t, false)
            w.__engagrUpdateMasks()
          }, time)
          const bytes = await page.screenshot({ path: `${out}/${mode}-${variant}-${time}.png` })
          const rendered = PNG.sync.read(bytes)
          const samples = points.map(([x, y]) => {
            const localX = x! - (animated ? time * 4 : 0)
            const inside = shape === 'ellipse'
              ? ((localX - 60) / 35) ** 2 + ((y! - 60) / 35) ** 2 < 1
              : localX >= 25 && localX < 95 && y! >= 25 && y! < 95
            const visible = mode === 'none' || (invert ? !inside : inside)
            const alpha = visible ? png.data[(y! * 120 + x!) * 4 + 3]! / 255 * 0.5 : 0
            const expected = [240, 80, 20].map(c => Math.round(c * alpha + 255 * (1 - alpha)))
            const actual = [...rendered.data.subarray((y! * rendered.width + x!) * 4, (y! * rendered.width + x!) * 4 + 3)]
            return { x, y, expected, actual }
          })
          receipts.push({ variant, time, samples, styles: await page.evaluate(() => [...document.querySelectorAll('[data-id]')].map(el => ({ id: el.getAttribute('data-id'), style: el.getAttribute('style') }))) })
          writeFileSync(`${out}/${mode}.json`, JSON.stringify({ synthetic: true, liveProvider: false, receipts }, null, 2))
          for (const sample of samples) for (let c = 0; c < 3; c++) {
            expect(Math.abs(sample.actual[c]! - sample.expected[c]!), `${mode}/${variant}/${time} pixel ${sample.x},${sample.y} channel ${c}`).toBeLessThanOrEqual(1)
          }
        }
      }
      expect(computeClipPathPx(bounds, target, shape, invert)).toBe(serverClip(bounds, target, shape, invert))
      expect(computeAnimatedClipPath(bounds, target, { x: 10, y: 0, scaleX: 1, scaleY: 1 }, { x: 0, y: 0, scaleX: 1, scaleY: 1 }, shape, invert))
        .toBe(computeClipPathPx({ ...bounds, x: 35 }, target, shape, invert))
    } finally { await page.close() }
  }, 60000)
})
