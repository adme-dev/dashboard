// @vitest-environment happy-dom
import { ref } from 'vue'
import gsap from 'gsap'
import { expect, it, vi } from 'vitest'
import { source } from './fixture'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { buildBannerHTML as serverHTML } from '~~/server/utils/banner/htmlBuilder'
import { useBannerTimeline } from '~/composables/useBannerTimeline'
import { timelinePhases } from '~/utils/banner-timeline-phases'
import { retimeAnimationPhase } from '~/utils/banner-timeline-edit'
import { removeTimelineAnimation } from '~/utils/banner-timeline-remove'
import { bannerWordTokens } from '~~/shared/bannerWordPop'
import { safeWordEntrance, wordEntranceDelay } from '~~/shared/bannerImportedMotion'
import type { Layer } from '~/types/banner-studio'

const wordSource = (variant: string, delays = ['0ms', '70ms']) => source.replace('<div id="effIn1"><div class="row">Hello world</div></div>', `<div id="effIn1" data-words-animation="true"><div class="row"><span class="word in" data-index="0" style="--wdi:${delays[0]}">Hello</span> <span class="word in" data-index="1" style="--wdi:${delays[1]}">world</span></div></div>`) + `<style>.word.in{display:inline-block;animation-name:words;animation-duration:.4s;animation-delay:var(--wdi);animation-iteration-count:1;animation-direction:normal;animation-fill-mode:backwards;animation-timing-function:cubic-bezier(.39,.575,.565,1)}@keyframes words{0%{transform:${variant};filter:blur(10px);opacity:0}40%{opacity:1}100%{transform:translateX(0) scale(1);filter:blur(0px)}}</style>`

it('retains editable words and strict reviewed blur-left geometry', async () => {
  const converted = await convertTheBriefHtml(wordSource('translateX(-20px) scale(1)'))
  expect(converted.warnings.join(' ')).not.toContain('animation not converted')
  const layer = converted.canvasData.custom_300x250.layers.find((layer: Layer) => layer.type === 'text')
  expect(layer.text).toBe('Hello world')
  expect(layer.wordPop).toMatchObject({ variant: 'blurLeft', duration: 0.4, stagger: 0.07 })
  const invalid = await convertTheBriefHtml(wordSource('translateX(-90px) scale(1)'))
  expect(invalid.warnings.join(' ')).toContain('Unsupported word animation keyframes')
})

it('keeps Unicode characters and whitespace without assigning delays to spaces', () => {
  expect(bannerWordTokens('A 🛻B', 'character')).toEqual([{ text: 'A', wordIndex: 0 }, { text: ' ', wordIndex: null }, { text: '🛻', wordIndex: 1 }, { text: 'B', wordIndex: 2 }])
})

const shape: Layer = { id: 1, name: 'Red band', type: 'rect', x: 0, y: 0, w: 200, h: 80, opacity: 1, zIndex: 1, fillColor: '#c3002f', animIn: 'none', animOut: 'none', animInDur: 0, startTime: 0, endTime: 4, keyframes: { opacity: [{ time: 0, value: 1 }, { time: 4, value: 1 }] }, reveal: { type: 'tvExpand', duration: 0.4, ease: 'cubic-bezier(.39,.575,.565,1)' } }

it('exports identical client/server reveal markup, timelines and font-editable copy', () => {
  const html = buildBannerHTML('custom_300x250', [shape])
  expect(serverHTML('custom_300x250', [shape])).toBe(html)
  expect(html).toContain('data-banner-reveal-content')
  expect(html).toContain('brightness(3.2) saturate(0.15)')
  expect(html).toContain('data-banner-reveal-glow')
  expect(html).not.toContain('window.creatopyEmbed')
})

it('seeks the reveal forward and backward, preserving shape geometry and a visible settled frame', () => {
  const board = { layers: [shape], playback: { duration: 4, loopCount: 0 } }
  const artboard = document.createElement('div')
  artboard.innerHTML = '<div id="lyr-1"><div data-banner-reveal><div data-banner-reveal-content></div><div data-banner-reveal-glow></div></div></div>'
  document.body.append(artboard)
  const state = { sets: { imported: board }, activeKey: 'imported', isLooping: true, isPlaying: false, currentTime: 0, duration: 4, soloMotionPath: false, selectedLayerId: null }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const timeline = useBannerTimeline().buildTimeline(artboard, board.layers)
  const effect = artboard.querySelector<HTMLElement>('[data-banner-reveal]')!
  try {
    timeline.totalTime(0.01, false)
    const early = Number(gsap.getProperty(effect, 'opacity'))
    timeline.totalTime(0.4, false)
    expect(Number(gsap.getProperty(effect, 'opacity'))).toBe(1)
    expect(effect.style.filter).toContain('brightness(1)')
    timeline.totalTime(0.01, false)
    expect(Number(gsap.getProperty(effect, 'opacity'))).toBeCloseTo(early, 5)
    expect(shape.w).toBe(200)
  } finally {
    timeline.kill()
    artboard.remove()
    vi.unstubAllGlobals()
  }
})

it('makes native reveal blocks retimeable and removable without dropping unrelated keyframes', () => {
  const phase = timelinePhases(shape).find(phase => phase.nativeEntrance === 'reveal')!
  expect(phase.label).toBe('Entry · TV reveal')
  expect(retimeAnimationPhase(shape, phase, 0.5, 1.3)).toEqual({ animInStart: 0.5, reveal: { ...shape.reveal, duration: 0.8 } })
  expect(removeTimelineAnimation(shape, phase, () => 1)).toEqual({ reveal: undefined })
  expect(shape.keyframes!.opacity).toHaveLength(2)
})

it('retimes explicit irregular character delays in proportion to the chosen block', () => {
  const text: Layer = { ...shape, type: 'text', text: 'RAM', reveal: undefined, wordPop: { duration: 0.05, stagger: 0, ease: 'cubic-bezier(0,0,1,1)', variant: 'typewriter', unit: 'character', delays: [0, 0.013, 0.029] } }
  const phase = timelinePhases(text).find(phase => phase.nativeEntrance === 'words')!
  const change = retimeAnimationPhase(text, phase, 1, 1.158)
  expect(change.wordPop!.duration).toBeCloseTo(0.1)
  expect(change.wordPop!.delays![1]).toBeCloseTo(0.026)
  expect(change.animInStart).toBe(1)
})

it('keeps typewriter letters hidden until their full CSS step-end duration has elapsed', () => {
  const text: Layer = { ...shape, type: 'text', text: 'RAM', reveal: undefined, wordPop: { duration: 0.05, stagger: 0.01, ease: 'cubic-bezier(0,0,1,1)', variant: 'typewriter', unit: 'character' } }
  const board = { layers: [text], playback: { duration: 4, loopCount: 0 } }
  const artboard = document.createElement('div')
  artboard.innerHTML = '<div id="lyr-1"><span data-banner-word="0">R</span><span data-banner-word="1">A</span><span data-banner-word="2">M</span></div>'
  document.body.append(artboard)
  vi.stubGlobal('useBannerStudio', () => ({ state: { sets: { imported: board }, activeKey: 'imported', isLooping: true, isPlaying: false, currentTime: 0, duration: 4 }, activeLayers: ref(board.layers) }))
  const timeline = useBannerTimeline().buildTimeline(artboard, board.layers)
  const first = artboard.querySelector('[data-banner-word]')!
  try {
    timeline.totalTime(0.049, false)
    expect(Number(gsap.getProperty(first, 'opacity'))).toBe(0)
    timeline.totalTime(0.05, false)
    expect(Number(gsap.getProperty(first, 'opacity'))).toBe(1)
    timeline.totalTime(0.02, false)
    expect(Number(gsap.getProperty(first, 'opacity'))).toBe(0)
  } finally {
    timeline.kill()
    artboard.remove()
    vi.unstubAllGlobals()
  }
})

it('converts only the complete reviewed TV mask and glow recipe', async () => {
  const html = source.replace('data-eltype="text"', 'data-eltype="shape"').replace('<div id="effIn1"><div class="row">Hello world</div></div>', '<div id="effIn1" class="tv"><div id="c-1" style="width:100%;height:100%;background-color:#c3002f"></div></div>') + `<style>
#effIn1.tv{animation-name:television;animation-duration:.4s;animation-delay:-1ms;animation-direction:normal;animation-iteration-count:1;animation-fill-mode:backwards;animation-timing-function:cubic-bezier(.39,.575,.565,1)}
.tv>*{-webkit-mask-image:linear-gradient(#000,#000);mask-image:linear-gradient(#000,#000);-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:var(--tv-collapse-mask-w) var(--tv-collapse-mask-h);mask-size:var(--tv-collapse-mask-w) var(--tv-collapse-mask-h)}
.tv::after{content:'';pointer-events:none;opacity:var(--tv-collapse-glow);left:0;right:0;top:50%;height:2px;margin-top:-1px;background:linear-gradient(90deg,transparent,#fff 12%,#fff 88%,transparent);box-shadow:0 0 13.6px 1.2px rgba(255,255,255,.77)}
@keyframes television{0%{--tv-collapse-mask-w:100%;--tv-collapse-mask-h:3px;filter:brightness(3.2) saturate(.15);opacity:0;--tv-collapse-glow:0.6}8%{opacity:1}22%{--tv-collapse-mask-w:100%;--tv-collapse-mask-h:3px;--tv-collapse-glow:0.6}55%{--tv-collapse-glow:0}60%{--tv-collapse-mask-w:100%;--tv-collapse-mask-h:100%;filter:brightness(3.2) saturate(.15)}100%{--tv-collapse-mask-w:400%;--tv-collapse-mask-h:400%;filter:brightness(1) saturate(1);opacity:1;--tv-collapse-glow:0}}
</style>`
  const converted = await convertTheBriefHtml(html)
  expect(converted.warnings.join(' ')).not.toContain('animation not converted')
  expect(converted.canvasData.custom_300x250.layers[1].reveal).toMatchObject({ type: 'tvExpand', duration: 0.4 })
  const held = await convertTheBriefHtml(html.replace('13.6px', '40px'))
  expect(held.warnings.join(' ')).toContain('Unsupported TV reveal composition')
})

it('bounds runtime metadata and extends letter timing when a designer adds copy', () => {
  const entrance = { duration: 0.05, stagger: 0.01, ease: 'power2.out', delays: [0, 0.013, 0.029] }
  expect(safeWordEntrance(entrance)).toEqual(entrance)
  expect(wordEntranceDelay(entrance, 3)).toBeCloseTo(0.0435)
  expect(safeWordEntrance({ ...entrance, duration: Infinity })).toBeUndefined()
  expect(safeWordEntrance({ ...entrance, delays: [NaN] })).toBeUndefined()
  expect(safeWordEntrance({ ...entrance, ease: '\');alert(1);//' })!.ease).toBe('linear')
})

it('extends the editable timeline block when new copy exceeds the imported letter delays', () => {
  const text: Layer = { ...shape, type: 'text', text: 'RAMX', reveal: undefined, wordPop: { duration: 0.05, stagger: 0.01, ease: 'linear', unit: 'character', delays: [0, 0.013, 0.029] } }
  expect(timelinePhases(text).find(phase => phase.nativeEntrance === 'words')!.end).toBeCloseTo(0.0935)
})
