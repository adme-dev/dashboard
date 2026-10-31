// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'
import gsap from 'gsap'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'

const pulseCss = `<style>
#effMid1{width:100%;height:100%;animation-name:pulse;animation-duration:1s;animation-delay:1s;animation-iteration-count:2;animation-direction:normal;animation-fill-mode:none;animation-timing-function:ease-in-out}
@keyframes pulse{0%,45%{transform:scale(1);animation-timing-function:ease-out}10%{transform:scale(.91);animation-timing-function:ease-in}17%{transform:scale(.98);animation-timing-function:ease-out}33%{transform:scale(.87);animation-timing-function:ease-in}}
</style>`
const pulse = source.replace('<div class="row">', '<div id="effMid1"><div class="row">').replace('</div></div></div></div></div>', '</div></div></div></div></div></div>') + pulseCss

it('keeps a repeated pulse editable with grouped selectors, implicit endpoints and segment easing', async () => {
  const result = await convertTheBriefHtml(pulse)
  expect(result.warnings.join(' ')).not.toMatch(/animation not converted|additional effects/)
  const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'text')
  expect(layer.keyframes.scaleX.map(f => f.time)).toEqual([0.2, 1.2, 1.3, 1.37, 1.53, 1.65, 2.2, 2.3, 2.37, 2.53, 2.65, 3.2])
  expect(layer.keyframes.scaleX.map(f => f.value)).toEqual([1, 1, 0.91, 0.98, 0.87, 1, 1, 0.91, 0.98, 0.87, 1, 1])
  expect(layer.keyframes.scaleX[1].easing).toBe('cubic-bezier(0,0,0.58,1)')
  expect(layer.keyframes.scaleX[2].easing).toBe('cubic-bezier(0.42,0,1,1)')
  expect(layer.keyframes.x.at(-1).value).toBe(0)
})

it('preserves a fractional repeated effect with exact cycle anchors to the visible slide boundary', async () => {
  const html = pulse.replace('animation-iteration-count:2;', 'animation-iteration-count:2.8;')
  const result = await convertTheBriefHtml(html)
  expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
  const frames = result.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.scaleX
  expect(frames.at(-1).time).toBe(4)
  expect(frames.length).toBeLessThan(500)
  expect(frames.find(frame => Math.abs(frame.time - 1.3) < 0.001)?.value).toBeCloseTo(0.91, 2)
})

it('converts bounded translate(x,y) vibration cycles', async () => {
  const html = pulse
    .replace('animation-duration:1s;animation-delay:1s;animation-iteration-count:2;', 'animation-duration:.6s;animation-delay:1s;animation-iteration-count:11.67;')
    .replace('@keyframes pulse{0%,45%{transform:scale(1);animation-timing-function:ease-out}10%{transform:scale(.91);animation-timing-function:ease-in}17%{transform:scale(.98);animation-timing-function:ease-out}33%{transform:scale(.87);animation-timing-function:ease-in}}', '@keyframes pulse{0%,100%{transform:translate(0,0)}20%{transform:translate(-2px,2px)}40%{transform:translate(-2px,-2px)}60%{transform:translate(2px,2px)}80%{transform:translate(2px,-2px)}}')
  const result = await convertTheBriefHtml(html)
  expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
  const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'text')
  expect(layer.keyframes.x.find(frame => Math.abs(frame.time - 1.32) < 0.001)?.value).toBe(-2)
  expect(layer.keyframes.y.find(frame => Math.abs(frame.time - 1.32) < 0.001)?.value).toBe(2)
})

it('preserves sequential entrance, pulse and visible exit without interpolating the resting hold', async () => {
  const html = pulse.replace('<div id="effIn1">', '<div id="effIn1"><div id="effOut1">')
    .replace('</div></div></div></div></div></div>', '</div></div></div></div></div></div></div>')
    + '<style>#effOut1{width:100%;height:100%;animation-name:exit;animation-duration:.5s;animation-delay:3.2s;animation-iteration-count:1;animation-direction:normal;animation-fill-mode:forwards;animation-timing-function:linear}@keyframes exit{from{opacity:1}to{opacity:0}}</style>'
  const result = await convertTheBriefHtml(html)
  expect(result.warnings.join(' ')).not.toMatch(/animation not converted|additional effects/)
  const frames = result.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.opacity
  expect(frames).toEqual([{ time: 0.2, value: 0, easing: 'cubic-bezier(.165,.84,.44,1)' }, { time: 1.2, value: 1, easing: 'linear' }, { time: 3.4, value: 1, easing: 'linear' }, { time: 3.9, value: 0 }, { time: 4, value: 0, easing: 'linear' }])
})

it('holds visible exit resets that cannot be represented by a continuous native track', async () => {
  const html = source.replace('<div class="row">', '<div id="effOut1"><div class="row">')
    + '<style>#effOut1{width:100%;height:100%;animation-name:exit;animation-duration:.5s;animation-delay:3.2s;animation-iteration-count:1;animation-direction:normal;animation-fill-mode:none;animation-timing-function:linear}@keyframes exit{from{opacity:1}to{opacity:0}}</style>'
  const result = await convertTheBriefHtml(html)
  expect(result.warnings.join(' ')).toMatch(/reset after completion.*animation not converted/)
})

it('records an intermediate effect outside the loop without making it visible', async () => {
  const result = await convertTheBriefHtml(pulse.replace('duration:4000', 'duration:1000').replace('animation-duration:1s;animation-delay:-1ms', 'animation-duration:.5s;animation-delay:-1ms'))
  expect(result.warnings.join(' ')).not.toMatch(/additional effects|animation not converted/)
  expect(result.warnings.join(' ')).toMatch(/effMid1.*not visible/)
  expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.scaleX).toBeUndefined()
})

it('reconstructs reversed CSS fades as editable exit tracks with reversed easing', async () => {
  const html = source.replace('<div class="row">', '<div id="effOut1"><div class="row">')
    + '<style>#effOut1{width:100%;height:100%;animation-name:exit;animation-duration:.5s;animation-delay:2s;animation-iteration-count:1;animation-direction:reverse;animation-fill-mode:both;animation-timing-function:cubic-bezier(.25,.46,.45,.94)}@keyframes exit{from{opacity:0}to{opacity:1}}</style>'
  const result = await convertTheBriefHtml(html)
  expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
  const frames = result.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.opacity
  expect(frames).toContainEqual({ time: 2.2, value: 1, easing: 'cubic-bezier(0.55,0.06,0.75,0.54)' })
  expect(frames).toContainEqual({ time: 2.7, value: 0 })
})

it('preserves finite pulse repetitions even when the export names their wrapper effOut', async () => {
  const result = await convertTheBriefHtml(pulse.replaceAll('effMid1', 'effOut1'))
  expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
  expect(result.canvasData.custom_300x250.layers.find(l => l.type === 'text').keyframes.scaleX).toBeDefined()
})

it.each([
  ['overlapping nested motion', 'animation-delay:1s', 'animation-delay:.3s'],
  ['infinite repetition', 'animation-iteration-count:2', 'animation-iteration-count:infinite'],
  ['reversed repetition', 'animation-direction:normal', 'animation-direction:alternate'],
  ['nonidentity reset', 'scale(.87)', 'scale(.87)']
])('continues to hold %s', async (name, from, to) => {
  let html = pulse.replace(from, to)
  if (name === 'nonidentity reset') html = html.replace('33%{', '100%{')
  const result = await convertTheBriefHtml(html)
  expect(result.warnings.join(' ')).toMatch(/animation not converted/)
})

it('plays repeated pulse anchors and restores them when scrubbing backwards after a save round-trip', async () => {
  const { parseTheBriefPackage } = await import('../../app/utils/thebrief-import')
  const candidate = await convertTheBriefHtml(pulse)
  const pkg = parseTheBriefPackage(JSON.parse(JSON.stringify({ kind: 'xeroflow-thebrief-import', version: 1, name: 'Motion test', source: { designHash: 'pulse', sha256: 'a'.repeat(64), folder: 'Tests', duration: 4, loopCount: 0 }, canvasData: candidate.canvasData, warnings: candidate.warnings, assets: [], fonts: [] })))
  const board = pkg.canvasData.custom_300x250
  const state = { sets: { imported: board }, activeKey: 'imported', isLooping: true, isPlaying: false, currentTime: 0, duration: 4, soloMotionPath: false, selectedLayerId: null }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const artboard = document.createElement('div')
  artboard.innerHTML = board.layers.map(layer => `<div id="lyr-${layer.id}"></div>`).join('')
  document.body.append(artboard)
  const timeline = useBannerTimeline().buildTimeline(artboard, board.layers)
  const target = artboard.querySelector(`#lyr-${board.layers.find(layer => layer.type === 'text').id}`)
  try {
    for (const [time, scale] of [[1.3, 0.91], [1.65, 1], [2.3, 0.91], [3.8, 1], [1.3, 0.91], [1.2, 1]]) {
      timeline.totalTime(time, false)
      expect(Number(gsap.getProperty(target, 'scaleX'))).toBeCloseTo(scale, 4)
      expect(Number(gsap.getProperty(target, 'scaleY'))).toBeCloseTo(scale, 4)
    }
    expect(timeline.duration()).toBe(4)
    expect(timeline.repeat()).toBe(-1)
  } finally {
    timeline.kill()
    artboard.remove()
    vi.unstubAllGlobals()
  }
})
