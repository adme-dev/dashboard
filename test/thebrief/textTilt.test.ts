// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import gsap from 'gsap'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import type { Layer } from '../../app/types/banner-studio'

const tilt = source.replace('width:200px;height:80px}', 'width:200px;height:80px;perspective:500px;perspective-origin:center}')
  .replace('translateX(-100px) translateY(0);opacity:0', 'translateY(-200px) rotateX(-30deg) scale(0);transform-origin:50% 100%;opacity:0')
  .replace('translateX(0) translateY(0);opacity:1', 'translateY(0) rotateX(0) scale(1);transform-origin:50% 480px;opacity:1')
  .replace('<div class="row">Hello world</div>', '<div style="width:100%;height:100%;transform:rotate(350deg)"><div class="row">Hello world</div></div>')
async function converted() {
  const c = await convertTheBriefHtml(tilt)
  expect(c.warnings).toEqual([])
  return c.canvasData.custom_300x250.layers.find(l => l.type === 'text') as Layer
}
afterEach(() => vi.unstubAllGlobals())
it('keeps the camera, changing pivot and inner text rotation separate in both renderers', async () => {
  const layer = await converted()
  expect(layer.textTilt).toEqual({ width: 200, height: 80, perspective: 500 })
  expect(layer.rotation).toBe(350)
  expect(layer.keyframes!.originY!.map(f => f.value)).toEqual([80, 480])
  expect(layer.keyframes!.rotationX!.map(f => f.value)).toEqual([-30, 0])
  const html = client('mrec', [layer])
  expect(server('mrec', [layer])).toBe(html)
  expect(html).toContain('perspective:500px;perspective-origin:100px 40px;')
  expect(html).toContain('data-banner-tilt style="width:200px;height:80px;')
  expect(html).toContain('transform:rotate(350deg)')
  expect(html).toContain('"--xf-origin-y": 480')
  expect(html).toContain(`[data-id="${layer.id}"] [data-banner-tilt]`)
})
it('holds unverified changing-pivot recipes and multirow perspective text', async () => {
  for (const html of [tilt.replace('50% 480px', '20% 480px'), tilt.replace('perspective-origin:center', 'perspective-origin:left top'), tilt.replace('rotateX(-30deg)', 'rotateX(-120deg)')]) {
    expect((await convertTheBriefHtml(html)).warnings).toContainEqual(expect.stringContaining('animation not converted'))
  }
  await expect(convertTheBriefHtml(tilt.replace('Hello world</div>', 'Hello world</div><div class="row">Second row</div>'))).rejects.toThrow('one source row')
})
it('scrubs the perspective child in both directions, repeats and resets without moving the camera', async () => {
  const layer = await converted()
  const layers=[layer]; const playback={duration:4,loopCount:0}
  const state={sets:{imported:{layers,playback}},activeKey:'imported',isLooping:true,isPlaying:false,currentTime:0,duration:4}
  vi.stubGlobal('useBannerStudio',()=>({state,activeLayers:ref(layers)}))
  const artboard=document.createElement('div')
  artboard.innerHTML=`<div id="lyr-${layer.id}" style="perspective:500px;perspective-origin:100px 40px"><div data-banner-tilt style="width:200px;height:80px;transform-origin:100px calc(var(--xf-origin-y, 80) * 1px)"></div></div>`
  document.body.append(artboard)
  const el=artboard.firstElementChild as HTMLElement; const child=el.firstElementChild as HTMLElement
  const studio=useBannerTimeline(); const tl=studio.buildTimeline(artboard,layers)
  try {
    tl.totalTime(.7,false)
    const rotation=Number(gsap.getProperty(child,'rotationX'))
    const pivot=child.style.getPropertyValue('--xf-origin-y')
    expect(rotation).toBeGreaterThan(-30);expect(rotation).toBeLessThan(0)
    expect(parseFloat(pivot)).toBeGreaterThan(80)
    expect(parseFloat(pivot)).toBeLessThan(480)
    expect(Number(gsap.getProperty(el,'rotationX'))).toBe(0)
    tl.totalTime(1.3,false);expect(Number(gsap.getProperty(child,'rotationX'))).toBeCloseTo(0)
    tl.totalTime(.7,false);expect(Number(gsap.getProperty(child,'rotationX'))).toBeCloseTo(rotation)
    expect(child.style.getPropertyValue('--xf-origin-y')).toBe(pivot)
    tl.totalTime(4.7,false);expect(Number(gsap.getProperty(child,'rotationX'))).toBeCloseTo(rotation)
    studio.stopTimeline();expect(Number(gsap.getProperty(child,'rotationX'))).toBe(0)
    expect(child.style.getPropertyValue('--xf-origin-y')).toBe('80')
    expect(el.style.perspective).toBe('500px')
  } finally {studio.destroyTimeline();artboard.remove()}
})
