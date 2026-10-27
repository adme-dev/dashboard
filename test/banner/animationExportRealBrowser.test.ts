import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const enabled = process.env.RUN_REAL_BROWSER_TESTS === 'true' && existsSync(chrome)
const output = 'output/editable-artwork-animation/render-parity'
let browser: Browser
let editorBundle: string
interface TestTimeline {
  seek(time: number, suppressEvents?: boolean): TestTimeline
  pause(time?: number): TestTimeline
}
interface AnimationWindow {
  __editorTimeline: TestTimeline
  __engagrTimeline: TestTimeline
  __editorGsap: { getProperty(element: Element, prop: string): number | string }
  gsap: AnimationWindow['__editorGsap']
  __createEditorTimeline(root: Element | null, layers: Layer[]): TestTimeline
}
const base: Layer = {
  id: 1, type: 'text', name: 'Native heading', text: 'RELOCATION SALE',
  x: 20, y: 25, w: 240, h: 60, fontSize: 24, fontFamily: 'Arial', fontWeight: 700,
  color: '#123456', opacity: 0.8, zIndex: 1, startTime: 0, endTime: 5,
  animIn: 'none', animInDur: 0.6, animOut: 'none', rotation: 12,
  motionPath: [{ x: 0, y: 0 }, { x: 100, y: 30 }],
  motionPathTweens: [{ startTime: 0, endTime: 2.5, pathStart: 0, pathEnd: 0.5, ease: 'none' },
    { startTime: 2.5, endTime: 5, pathStart: 0.5, pathEnd: 1, ease: 'power2.inOut' }]
}
const cases: Array<[string, Partial<Layer>]> = [
  ['native path', {}],
  ['fade and motion', { animIn: 'fadeIn' }],
  ['scaled entrance and motion', { animIn: 'zoomIn' }],
  ['delayed motion', { startTime: 1, motionPathTweens: [{ startTime: 1, endTime: 5, pathStart: 0, pathEnd: 1, ease: 'none' }] }],
  ['position keyframes without opacity', { keyframes: { x: [{ time: 0, value: 0 }, { time: 5, value: 100 }], y: [{ time: 0, value: 0 }, { time: 5, value: 30 }] } }],
  ['native keyframes and motion', { keyframes: { opacity: [{ time: 0, value: 0.8 }, { time: 5, value: 0.8 }], rotation: [{ time: 0, value: 12 }, { time: 5, value: 22 }] } }]
]

describe.skipIf(!enabled)('actual browser editor/export animation parity', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    mkdirSync(output, { recursive: true })
    const bundled = await build({
      stdin: { contents: `import gsap from 'gsap'; import { useBannerTimeline } from './app/composables/useBannerTimeline';
        window.useBannerStudio = () => ({ state: { isLooping: false }, activeLayers: { value: [] } });
        window.__editorGsap = gsap;
        window.__createEditorTimeline = (root, layers) => useBannerTimeline().buildTimelineForKey(root, layers);`, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, write: false, platform: 'browser', format: 'iife',
      alias: { '~': resolve('app'), '~~': process.cwd() }
    })
    editorBundle = bundled.outputFiles[0]!.text
  }, 60000)
  afterAll(async () => {
    await browser?.close()
  })

  it.each(cases)('%s preserves native text and matches forward/reverse seeks', async (name, changes) => {
    const layer = { ...structuredClone(base), ...changes }
    const html = client('mrec', [layer], { includeAnimations: true })
    expect(server('mrec', [layer], { includeAnimations: true })).toBe(html)
    const context = await browser.newContext()
    await context.route('**/*', route => route.abort())
    const editor = await context.newPage()
    const exported = await context.newPage()
    const errors: string[] = []
    for (const page of [editor, exported]) page.on('pageerror', error => errors.push(error.message))
    try {
      await editor.setContent(client('mrec', [layer], { includeAnimations: false }))
      await editor.addScriptTag({ content: editorBundle })
      await editor.evaluate((layers) => {
        const w = window as unknown as AnimationWindow
        const el = document.querySelector('[data-id="1"]')!
        el.id = 'lyr-1'
        w.__editorTimeline = w.__createEditorTimeline(el.parentElement, layers)
        // Compare initialized playback; the editor initially presents a static resting frame.
        w.__editorTimeline.seek(0.000001, false).seek(0, false)
      }, [layer])
      const offline = html.replace(/<script src="https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/gsap\/[^/]+\/([^"/]+)"><\/script>/g,
        (_all, file) => `<script>${readFileSync(resolve('node_modules/gsap/dist', file), 'utf8').replaceAll('</script', '<\\/script')}</script>`)
      await exported.setContent(offline)
      await exported.evaluate(() => {
        (window as unknown as AnimationWindow).__engagrTimeline.pause().seek(0.000001, false).seek(0, false)
      })
      const samples = []
      for (const time of [0, 0.25, 0.6, 1, 2.4999, 2.5, 4.5, 1, 0]) {
        const sample = async (page: typeof editor, isEditor: boolean) => await page.evaluate(({ time, isEditor }) => {
          const w = window as unknown as AnimationWindow
          const tl = isEditor ? w.__editorTimeline : w.__engagrTimeline
          const gsap = isEditor ? w.__editorGsap : w.gsap
          tl.seek(time, false)
          const element = document.querySelector('[data-id="1"]')!
          return Object.fromEntries(['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'].map(prop => [prop, Number(gsap.getProperty(element, prop))]))
        }, { time, isEditor })
        samples.push({ time, editor: await sample(editor, true), exported: await sample(exported, false) })
      }
      writeFileSync(`${output}/${name.replaceAll(' ', '-')}.json`, JSON.stringify({ name, samples, errors }, null, 2))
      expect(errors).toEqual([])
      const midpoint = samples.find(sample => sample.time === 2.5)!
      for (const mode of ['editor', 'exported'] as const) expect(midpoint[mode].opacity, `${name}, ${mode}: moving text must stay visible`).toBeCloseTo(base.opacity, 3)
      if (!changes.startTime) {
        const boundary = samples.find(sample => sample.time === 2.5)!
        for (const mode of ['editor', 'exported'] as const) {
          expect(boundary[mode].x, `${name}, ${mode}: path must not jump at the second tween`).toBeCloseTo(50, 1)
          expect(boundary[mode].y, `${name}, ${mode}: path midpoint`).toBeCloseTo(15, 1)
        }
      }
      expect(await exported.locator('[data-id="1"]').textContent()).toBe(base.text)
      for (const sample of samples) for (const key of Object.keys(sample.editor)) {
        expect(sample.exported[key], `${name}, time ${sample.time}, ${key}`).toBeCloseTo(sample.editor[key]!, 2)
      }
    } finally { await context.close() }
  }, 30000)
})
