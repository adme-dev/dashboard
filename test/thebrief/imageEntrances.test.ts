// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import gsap from 'gsap'
import { retimeLayerPresence, retimeAnimationPhase } from '../../app/utils/banner-timeline-edit'
import { timelinePhases } from '../../app/utils/banner-timeline-phases'
import { editSlides, slidePoster } from '../../app/utils/banner-slides'
import type { Layer } from '../../app/types/banner-studio'
import { source } from './fixture'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { addImageEntranceTimeline, imageEntranceMarkup } from '../../shared/bannerImageEntrance.mjs'
import { buildBannerHTML as clientHtml } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as serverHtml } from '../../server/utils/banner/htmlBuilder'

const split = readFileSync('test/thebrief/fixtures/split-slam.css', 'utf8')
const wipe = readFileSync('test/thebrief/fixtures/soft-wipe.css', 'utf8')
function artwork(css: string, name = 'kARzSI') {
  return source.replace('data-eltype="text"', 'data-eltype="image"')
    .replace('<div class="row">Hello world</div>', '<div id="c-1"></div>')
    + `<style>#c-1{width:100%;height:100%;background-image:url(./art.png);background-size:cover;background-position:50% 50%;background-repeat:no-repeat}#effIn1{animation-name:${name};animation-fill-mode:both}${css}</style>`
}
it.each([['splitSlam', split, 'kARzSI'], ['softWipe', wipe, 'kgESLE']])('preserves the exported %s entrance alongside layer keyframes', async (kind, css, name) => {
  const result = await convertTheBriefHtml(artwork(css, name))
  expect(result.warnings).not.toEqual(expect.arrayContaining([expect.stringContaining('animation not converted')]))
  const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'image')
  expect(layer.imageEntrance).toEqual({ kind, start: 0.2, duration: 1, ease: 'cubic-bezier(.165,.84,.44,1)' })
  const client = clientHtml('custom_300x250', [layer]), server = serverHtml('custom_300x250', [layer])
  for (const html of [client, server]) {
    expect(html).toContain('data-image-entrance')
    expect(html).toContain('animation-play-state:paused')
    expect(html).toContain('tl.fromTo(e,{animationDelay:')
    expect(html).toContain(kind === 'splitSlam' ? 'xf-slam-top' : 'xf-soft-wipe')
  }
})
it('holds a changed Split Slam transform rather than silently changing its composition', async () => {
  await expect(convertTheBriefHtml(artwork(split.replaceAll('--split-slam-k:8', '--split-slam-k:7')))).rejects.toThrow('unsupported Split Slam keyframes')
  await expect(convertTheBriefHtml(artwork(split.replaceAll('0.5px', '0.75px')))).rejects.toThrow('unsupported Split Slam clipping')
})
it('holds an unrecognised mask animation', async () => {
  await expect(convertTheBriefHtml(artwork(wipe.replaceAll('148%', '120%'), 'kgESLE'))).rejects.toThrow('unsupported soft wipe')
})
it('scrubs both directions and resets an image entrance before its start', () => {
  const element = document.createElement('div')
  element.innerHTML = imageEntranceMarkup('./art.png', { kind: 'splitSlam', start: 2, duration: 1, ease: 'cubic-bezier(.39,.575,.565,1)' })
  document.body.append(element)
  const timeline = gsap.timeline({ paused: true }).to({}, { duration: 8 }, 0)
  addImageEntranceTimeline(timeline, element, { kind: 'splitSlam', start: 2, duration: 1, ease: 'cubic-bezier(.39,.575,.565,1)' })
  const image = element.querySelector<HTMLElement>('[data-image-entrance]')!
  timeline.seek(2.5)
  expect(image.style.animationDelay).toBe('-0.5s')
  timeline.seek(1)
  expect(image.style.animationDelay).toBe('0s')
  timeline.seek(2.25)
  expect(image.style.animationDelay).toBe('-0.25s')
  timeline.kill()
  element.remove()
})

it('uses measured rows only when the original layout has been established', async () => {
  const html = source.replace('height:80px', 'height:86.4px').replace('<div class="row">Hello world</div>', '<div class="row">PLUS</div><div class="row">FREE ON ROADS*</div>')
  await expect(convertTheBriefHtml(html)).rejects.toThrow('Wrapped text across stacked rows')
  const result = await convertTheBriefHtml(html, { textRowMetrics: { 1: [28.8, 57.6] } })
  const layers = result.canvasData.custom_300x250.layers.filter(l => l.type === 'text')
  expect(layers.map(l => [l.y, l.h])).toEqual([[20, 28.8], [48.8, 57.6]])
  await expect(convertTheBriefHtml(html, { textRowMetrics: { 1: [100, 100] } })).rejects.toThrow('Invalid measured source row layout')
})

it('keeps image entrances aligned when editing presence, animation blocks and slides', () => {
  const layer = { id: 1, type: 'image', x: 0, y: 0, w: 300, h: 250, opacity: 1, startTime: 0, endTime: 4, slideId: 's1', animIn: 'none', animOut: 'none', imageEntrance: { kind: 'splitSlam', start: 0, duration: 1, ease: 'cubic-bezier(.39,.575,.565,1)' }, keyframes: { opacity: [{ time: 0, value: 1 }, { time: 4, value: 1 }] } } as Layer
  const entry = timelinePhases(layer).find(p => p.kind === 'entry')!
  expect(entry.label).toContain('Split Slam')
  expect(retimeLayerPresence(layer, 2, 10).imageEntrance).toMatchObject({ start: 2, duration: 2 })
  expect(retimeAnimationPhase(layer, entry, 0.5, 2).imageEntrance).toMatchObject({ start: 0.5, duration: 1.5 })
  const board = { layers: [layer], slides: [{ id: 's1', name: 'First', duration: 4 }], playback: { duration: 4, loopCount: 0 } }
  expect(editSlides(board, { type: 'duration', index: 0, duration: 8 }, () => 100, { w: 300, h: 250 }).layers[0].imageEntrance).toMatchObject({ start: 0, duration: 2 })
  expect(slidePoster(board, 's1').layers[0].imageEntrance).toBeUndefined()
})
