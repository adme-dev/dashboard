// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as serverHTML } from '../../server/utils/banner/htmlBuilder'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import'
import { source } from './fixture'
import type { Layer } from '../../app/types/banner-studio'

gsap.registerPlugin(CustomEase)

const fixture = (frames: string, iterations = '2.5', fill = 'none', easing = 'linear') => source
  .replace('<div class="row">', '<div id="effMid1"><div class="row">')
  + `<style>#effMid1{width:100%;height:100%;animation-name:pulse;animation-duration:.6s;animation-delay:1.1s;animation-iteration-count:${iterations};animation-direction:normal;animation-fill-mode:${fill};animation-timing-function:${easing}}@keyframes pulse{${frames}}</style>`

const pulse = '0%,100%{opacity:1}50%{opacity:.2}'

it('preserves unpainted source shapes as transparent through package validation and export', async () => {
  const html = source.replace('data-eltype="text"', 'data-eltype="shape"')
    .replace('<div class="row">Hello world</div>', '<div id="c-1" style="width:100%;height:100%;border:0px solid #000;border-radius:0px"></div>')
  const c = await convertTheBriefHtml(html)
  const pkg = parseTheBriefPackage({ kind: 'xeroflow-thebrief-import', version: 1, name: 'Unpainted shape', source: { designHash: 'empty-shape', sha256: 'b'.repeat(64), folder: '', duration: 4, loopCount: 0 }, canvasData: c.canvasData, warnings: c.warnings, assets: [], fonts: [] })
  const layer = pkg.canvasData.custom_300x250.layers.find(l => l.type === 'rect')
  expect(layer.fillColor).toBe('transparent')
  expect(buildBannerHTML('custom_300x250', [layer] as Layer[])).toContain('background:transparent;')
  expect(serverHTML('custom_300x250', [layer] as Layer[])).toBe(buildBannerHTML('custom_300x250', [layer] as Layer[]))
})

it.each(['blur(0)', 'blur(0px)', 'blur(0.0px)'])('accepts only the inert %s filter without changing motion', async (filter) => {
  const result = await convertTheBriefHtml(source.replace('opacity:0}', `opacity:0;filter:${filter}}`).replace('opacity:1}', `opacity:1;filter:${filter}}`))
  expect(result.warnings).toEqual([])
  expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.x[0].value).toBe(-100)
})

it.each(['blur(6px)', 'blur(0px) brightness(2)', 'url(https://invalid.test/filter)', 'blur(-0px)'])('holds unsupported filter %s', async (filter) => {
  const result = await convertTheBriefHtml(source.replace('opacity:0}', `opacity:0;filter:${filter}}`))
  expect(result.warnings.join(' ')).toMatch(/Unsupported animated properties.*animation not converted/)
})

it('retains the exact fractional ending value and a simultaneous fill:none reset', async () => {
  const candidate = await convertTheBriefHtml(fixture(pulse))
  expect(candidate.warnings).toEqual([])
  const frames = candidate.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.opacity
  expect(frames.filter(frame => frame.time === 2.8).map(frame => frame.value)).toEqual([0.2, 1])
  expect(frames.at(-1)).toMatchObject({ time: 4, value: 1 })
  const held = await convertTheBriefHtml(fixture(pulse, '2.5', 'forwards'))
  expect(held.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.opacity.at(-1).value).toBe(0.2)
})

it('preserves bounce jumps at the initial and repeated cycle boundary', async () => {
  const candidate = await convertTheBriefHtml(fixture('0%{transform:translateY(-45px)}100%{transform:translateY(0)}', '2.5'))
  expect(candidate.warnings).toEqual([])
  const frames = candidate.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.y
  expect(frames.filter(frame => frame.time === 1.3).map(frame => frame.value)).toEqual([0, -45])
  expect(frames.filter(frame => frame.time === 1.9).map(frame => frame.value)).toEqual([0, -45])
  const reset = frames.filter(frame => frame.time === 2.8)
  expect(reset).toHaveLength(2)
  expect(reset[0].value).toBeCloseTo(-22.5, 10)
  expect(reset[1].value).toBe(0)
})

it('clips a cubic curve algebraically instead of changing its timing or sampling its motion', async () => {
  const candidate = await convertTheBriefHtml(fixture(pulse, '2.25', 'forwards', 'ease-in'))
  expect(candidate.warnings).toEqual([])
  const frames = candidate.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.opacity
  const from = frames.find(frame => frame.time === 2.5)
  const to = frames.find(frame => frame.time === 2.65)
  const original = CustomEase.create('', 'M0,0 C0.42,0 1,1 1,1')
  const clipped = CustomEase.create('', from.easing.replace('cubic-bezier(', '').replace(')', ''))
  for (const fraction of [0.1, 0.4, 0.75, 1]) {
    expect(from.value + (to.value - from.value) * clipped(fraction)).toBeCloseTo(1 - 0.8 * original(fraction / 2), 3)
  }
  expect(to.value).toBeCloseTo(1 - 0.8 * original(0.5), 3)
})

it('continues to hold fractional effects outside the supported intermediate adapter', async () => {
  const result = await convertTheBriefHtml(fixture(pulse).replaceAll('effMid1', 'effOut1'))
  expect(result.warnings.join(' ')).toMatch(/Fractional non-intermediate.*animation not converted/)
})

it.each([
  { property: 'opacity', effect: pulse, probes: [[2.799, 0.202666667], [2.8, 1], [3.7, 1], [2.799, 0.202666667], [2.8, 1], [1.6, 0.2]] },
  { property: 'y', effect: '0%{transform:translateY(-45px)}100%{transform:translateY(0)}', probes: [[0, 0], [0.5, 0], [1.299, 0], [1.3, -45], [1.899, -0.075], [1.9, -45], [2.8, 0], [3.7, 0], [1.899, -0.075], [1.3, -45], [1.299, 0], [0, 0]] }
])('replays native and both exported $property boundaries after JSON save/reload and backwards seeks', async ({ property, effect, probes }) => {
  const c = await convertTheBriefHtml(fixture(effect))
  const pkg = parseTheBriefPackage(JSON.parse(JSON.stringify({ kind: 'xeroflow-thebrief-import', version: 1, name: 'Reset', source: { designHash: 'reset', sha256: 'a'.repeat(64), folder: '', duration: 4, loopCount: 0 }, canvasData: c.canvasData, warnings: c.warnings, assets: [], fonts: [] })))
  const board = pkg.canvasData.custom_300x250
  const layer = board.layers.find(l => l.type === 'text')
  const state = { sets: { imported: board }, activeKey: 'imported', isLooping: true, isPlaying: false, currentTime: 0, duration: 4, soloMotionPath: false, selectedLayerId: null }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const artboard = document.createElement('div')
  artboard.innerHTML = board.layers.map(l => `<div id="lyr-${l.id}"></div>`).join('')
  document.body.append(artboard)
  const native = useBannerTimeline().buildTimeline(artboard, board.layers)
  const nativeTarget = artboard.querySelector(`#lyr-${layer.id}`)
  const html = buildBannerHTML('custom_300x250', [layer] as Layer[])
  expect(serverHTML('custom_300x250', [layer] as Layer[])).toBe(html)
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('const tl ='))![1]
  const target = { opacity: 1, x: 0, y: 0 }
  const exported = gsap.timeline({ paused: true })
  const wrapped = { set: (_s, vars, at) => exported.set(target, vars, at), to: (_s, vars, at) => exported.to(target, vars, at), eventCallback: exported.eventCallback.bind(exported) }
  try {
    new Function('gsap', 'window', 'CustomEase', script)({ timeline: () => wrapped, registerPlugin: gsap.registerPlugin }, {}, CustomEase)
    for (const [time, value] of probes) {
      native.totalTime(time, false)
      exported.totalTime(time, false)
      expect(Number(gsap.getProperty(nativeTarget, property))).toBeCloseTo(value, 3)
      expect(target[property]).toBeCloseTo(value, 3)
    }
  } finally {
    native.kill()
    exported.kill()
    artboard.remove()
    vi.unstubAllGlobals()
  }
})
