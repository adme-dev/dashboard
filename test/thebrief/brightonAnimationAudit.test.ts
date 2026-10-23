// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import gsap from 'gsap'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'

// Sanitized reconstruction of the audited export's complete timing topology.
// Copy and artwork are placeholders; delays, repetitions, presence and easing
// match the export. Seven native layers intentionally have no source motion.
const faded = [
  { id: 16, delay: 2.4 }, { id: 17, delay: 2.2 },
  { id: 22, delay: 4.6 }, { id: 23, delay: 2.2 },
  { id: 19, delay: 2.4 }, { id: 20, delay: 2.2 },
  { id: 24, delay: 1.8 }, { id: 30, delay: 1.6 }
]
const sourceIds = [4, 5, 8, 9, 16, 17, 22, 23, 19, 20, 24, 26, 27, 29, 30]
function bannerSource(duration: number) {
  const elements = sourceIds.map((id) => {
    const fade = faded.find(item => item.id === id)
    return { id, ...(fade ? { duration: Math.round((fade.delay + 0.4) * 1000) } : {}) }
  })
  return `<style>
#designContainer{width:1000px;height:1000px;background:#171925}
[data-eltype]{position:absolute;left:10px;top:20px;width:200px;height:80px}
.row{font-family:Arial;font-size:24px;font-weight:700;color:#fff;line-height:1.2}
#effMid9{width:100%;height:100%;animation-name:pulse;animation-duration:2s;animation-delay:1s;animation-iteration-count:2;animation-direction:normal;animation-fill-mode:none;animation-timing-function:ease-in-out}
@keyframes pulse{0%,45%{transform:scale(1);animation-timing-function:ease-out}10%{transform:scale(.91);animation-timing-function:ease-in}17%{transform:scale(.98);animation-timing-function:ease-out}33%{transform:scale(.87);animation-timing-function:ease-in}}
${faded.map(({ id, delay }) => `#effOut${id}{width:100%;height:100%;animation-name:fade;animation-duration:.4s;animation-delay:${delay}s;animation-iteration-count:1;animation-direction:reverse;animation-fill-mode:both;animation-timing-function:cubic-bezier(.25,.46,.45,.94)}`).join('\n')}
@keyframes fade{0%{opacity:0}100%{opacity:1}}
</style><script>window.creatopyEmbed={designData:{width:1000,height:1000,loopCount:0,animations:[{type:'slide',id:2,duration:${duration},effInDuration:0,effOutDuration:0,elements:${JSON.stringify(elements)}}],customAnimations:[]}};</script>
<div id="designContainer"><div id="slide-2">${sourceIds.map(id => `<div id="element-${id}" data-eltype="text">${id === 9 ? '<div id="effMid9">' : faded.some(item => item.id === id) ? `<div id="effOut${id}">` : ''}<div class="row">Layer ${id}</div>${id === 9 || faded.some(item => item.id === id) ? '</div>' : ''}</div>`).join('')}</div></div>`
}

afterEach(() => vi.unstubAllGlobals())

it('reports every delayed source effect outside the original one-second loop instead of inventing visible motion', async () => {
  const result = await convertTheBriefHtml(bannerSource(1000))
  expect(result.canvasData.custom_1000x1000.playback.duration).toBe(1)
  expect(result.warnings.filter(message => /effect starts after the slide loop|exit at .* is outside the 1s loop/.test(message))).toHaveLength(9)
  expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
})

it('plays all nine reconstructed motion layers, keeps static originals still, and restores motion across seek and loop boundaries', async () => {
  const result = await convertTheBriefHtml(bannerSource(6000))
  expect(result.warnings).toEqual([])
  const board = JSON.parse(JSON.stringify(result.canvasData.custom_1000x1000))
  expect(board.layers).toHaveLength(16)
  expect(board.layers.filter(layer => Object.values(layer.keyframes).some((frames: Array<{ value: number }>) => new Set(frames.map(frame => frame.value)).size > 1))).toHaveLength(9)
  const state = { sets: { imported: board }, activeKey: 'imported', isLooping: true, isPlaying: false, currentTime: 0, duration: 6, soloMotionPath: false, selectedLayerId: null }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const artboard = document.createElement('div')
  artboard.innerHTML = board.layers.map(layer => `<div id="lyr-${layer.id}"></div>`).join('')
  document.body.append(artboard)
  const timeline = useBannerTimeline().buildTimeline(artboard, board.layers)
  const element = (id: number) => artboard.querySelector(`#lyr-${board.layers.find(layer => layer.name === `Layer ${id}`).id}`) as HTMLElement
  try {
    for (const [time, scale] of [[1.2, 0.91], [1.66, 0.87], [3.2, 0.91], [3.66, 0.87], [5.2, 1], [1.2, 0.91], [6.2, 1], [7.2, 0.91]]) {
      timeline.totalTime(time, false)
      expect(Number(gsap.getProperty(element(9), 'scaleX'))).toBeCloseTo(scale, 4)
      expect(Number(gsap.getProperty(element(9), 'scaleY'))).toBeCloseTo(scale, 4)
    }
    for (const { id, delay } of faded) {
      timeline.totalTime(delay - 0.05, false)
      expect(Number(gsap.getProperty(element(id), 'opacity'))).toBeCloseTo(1, 4)
      expect(element(id).style.visibility).toBe('visible')
      timeline.totalTime(delay + 0.2, false)
      const halfway = Number(gsap.getProperty(element(id), 'opacity'))
      expect(halfway).toBeGreaterThan(0)
      expect(halfway).toBeLessThan(1)
      timeline.totalTime(delay + 0.45, false)
      expect(Number(gsap.getProperty(element(id), 'opacity'))).toBeCloseTo(0, 4)
      expect(element(id).style.visibility).toBe('hidden')
      for (const time of [0.5, 6.5]) {
        timeline.totalTime(time, false)
        expect(Number(gsap.getProperty(element(id), 'opacity'))).toBeCloseTo(1, 4)
        expect(element(id).style.visibility).toBe('visible')
      }
    }
    for (const time of [0.5, 2.5, 5.5, 6.5]) {
      timeline.totalTime(time, false)
      expect(Number(gsap.getProperty(artboard.querySelector('#lyr-1'), 'opacity'))).toBeCloseTo(1, 4)
      for (const id of [4, 5, 8, 26, 27, 29]) {
        expect(Number(gsap.getProperty(element(id), 'opacity'))).toBeCloseTo(1, 4)
        expect(Number(gsap.getProperty(element(id), 'scaleX'))).toBeCloseTo(1, 4)
      }
    }
    expect(timeline.duration()).toBe(6)
    expect(timeline.repeat()).toBe(-1)
  } finally {
    timeline.kill()
    artboard.remove()
  }
})
