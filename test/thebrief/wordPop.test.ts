// @vitest-environment happy-dom
import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
import gsap from 'gsap'
import { source } from './fixture'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'

const html = source
  .replace('<div id="effIn1"><div class="row">Hello world</div></div>', '<div id="effIn1" data-words-animation="true"><div class="row"><span class="word in" data-index="0" style="--wdi:0ms">Hello</span> <span class="word in" data-index="1" style="--wdi:500ms">world</span></div></div>')
  + `<style>.word.in{display:inline-block;animation-name:pop;animation-duration:.5s;animation-delay:var(--wdi);animation-iteration-count:1;animation-direction:normal;animation-fill-mode:backwards;animation-timing-function:cubic-bezier(.21,.79,.09,.97)}
@keyframes pop{0%{transform:translateY(0) scale(.6);filter:blur(10px);opacity:0}40%{opacity:1}70%{transform:translateY(0) scale(1.05)}100%{transform:translateY(0) scale(1);filter:blur(0px)}}</style>`

it('keeps a reviewed word entrance editable and renders its stagger in native HTML', async () => {
  const result = await convertTheBriefHtml(html)
  expect(result.warnings.join(' ')).not.toMatch(/animation not converted/)
  const layer = result.canvasData.custom_300x250.layers.find(item => item.type === 'text')
  expect(layer.wordPop).toEqual({ duration: 0.5, stagger: 0.5, ease: 'cubic-bezier(.21,.79,.09,.97)' })
  const output = buildBannerHTML('custom_300x250', result.canvasData.custom_300x250.layers, { playback: { duration: 4, loopCount: 0 } })
  expect(output).toContain('data-banner-word="0"')
  expect(output).toContain('data-banner-word="1"')
  expect(output).toContain('index * 0.5')
  expect(output).toContain('CustomEase.create')
})

it('seeks each word at its own start time in the native timeline', async () => {
  const result = await convertTheBriefHtml(html)
  const board = result.canvasData.custom_300x250
  const layer = board.layers.find(item => item.type === 'text')
  const artboard = document.createElement('div')
  artboard.innerHTML = board.layers.map(item => `<div id="lyr-${item.id}">${item.id === layer.id ? '<span data-banner-word="0">Hello</span> <span data-banner-word="1">world</span>' : ''}</div>`).join('')
  document.body.append(artboard)
  const state = { sets: { imported: board }, activeKey: 'imported', isLooping: true, isPlaying: false, currentTime: 0, duration: 4, soloMotionPath: false, selectedLayerId: null }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const timeline = useBannerTimeline().buildTimeline(artboard, board.layers)
  const words = artboard.querySelectorAll('[data-banner-word]')
  try {
    timeline.totalTime(0.5, false)
    expect(Number(gsap.getProperty(words[0], 'opacity'))).toBeGreaterThan(0.9)
    expect(Number(gsap.getProperty(words[1], 'opacity'))).toBe(0)
    timeline.totalTime(0.75, false)
    expect(Number(gsap.getProperty(words[1], 'opacity'))).toBeGreaterThan(0.7)
  } finally {
    timeline.kill()
    artboard.remove()
    vi.unstubAllGlobals()
  }
})
