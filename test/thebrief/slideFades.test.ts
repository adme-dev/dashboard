// @vitest-environment happy-dom
import { ref } from 'vue'
import { expect, it, vi } from 'vitest'
import gsap from 'gsap'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { useBannerTimeline } from '../../app/composables/useBannerTimeline'
import { bannerSlideGroups } from '../../shared/bannerSlideFade'

export const fadingSlides = `<style>
#designContainer{width:300px;height:250px;background:#fff}
.shape{position:absolute;left:0px;top:0px;width:300px;height:250px}
.content{width:100%;height:100%;background-color:#f00;background-image:none}
#effIn20{width:100%;height:100%;animation-name:scene;animation-duration:1s;animation-timing-function:cubic-bezier(0,0,1,1);animation-delay:0s;animation-iteration-count:1;animation-direction:normal;animation-fill-mode:backwards}
@keyframes scene{0%{opacity:0}100%{opacity:1}}
</style><script>window.creatopyEmbed={designData:{designHash:"fade",width:300,height:250,loopCount:0,animations:[
{type:"slide",id:10,duration:2000,effInDuration:0,effOutDuration:1000,elements:[]},
{type:"slide",id:20,duration:2000,effInDuration:1000,effOutDuration:0,crossTypeOut:"cross",elements:[]}],customAnimations:[]}};</script>
<div id="designContainer"><div id="slide-10"><div id="element-101" class="shape" data-eltype="shape"><div id="c-101" class="content"></div></div></div>
<div id="slide-20"><div id="effIn20"><div id="element-201" class="shape" data-eltype="shape"><div id="c-201" class="content" style="background-color:#00f"></div></div><div id="element-202" class="shape" data-eltype="shape"><div id="c-202" class="content" style="background-color:transparent"></div></div></div></div></div>`

it('preserves the full scene overlap and fades a composited group in both playback paths', async () => {
  const result = await convertTheBriefHtml(fadingSlides)
  const pkg = parseTheBriefPackage({ kind: 'xeroflow-thebrief-import', version: 1, name: 'Fade test', source: { ...result.source, sha256: 'a'.repeat(64), folder: '' }, canvasData: result.canvasData, assets: [], fonts: [], warnings: result.warnings })
  const board = pkg.canvasData.custom_300x250!
  expect(pkg.source.duration).toBe(5)
  expect(board.layers.find(layer => layer.slideId === 'source-slide:10')!.endTime).toBe(3)
  const output = buildBannerHTML('custom_300x250', board.layers as never, { playback: board.playback })
  expect(output).toContain('data-banner-slide="source-slide:20"')
  expect(output).toContain('duration:1,ease:')
  const exported = document.createElement('div')
  exported.innerHTML = output
  const exportedScenes = [...exported.querySelectorAll<HTMLElement>('[data-banner-slide]')]
  expect(exportedScenes.map(scene => Number(scene.style.zIndex))).toEqual([2, 3])
  // Each scene keeps its own stacking context even when opacity reaches one.
  // Otherwise outgoing positive-z layers cover a partially faded incoming scene.
  expect(Number(exportedScenes[1]!.style.zIndex)).toBeGreaterThan(Number(exportedScenes[0]!.style.zIndex))
  const artboard = document.createElement('div')
  for (const group of bannerSlideGroups(board.layers as never)) {
    const wrapper = document.createElement('div')
    if (group.fade) wrapper.dataset.bannerSlide = group.key
    wrapper.innerHTML = group.layers.map(layer => `<div id="lyr-${layer.id}"></div>`).join('')
    artboard.append(wrapper)
  }
  document.body.append(artboard)
  const state = { sets: { imported: board }, activeKey: 'imported', isLooping: true, isPlaying: false, currentTime: 0, duration: 5, soloMotionPath: false, selectedLayerId: null }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: ref(board.layers) }))
  const timeline = useBannerTimeline().buildTimeline(artboard, board.layers as never)
  try {
    const scene = artboard.querySelector<HTMLElement>('[data-banner-slide="source-slide:20"]')!
    timeline.totalTime(2.5, false)
    expect(Number(gsap.getProperty(scene, 'opacity'))).toBeCloseTo(0.5, 2)
    expect(scene.children).toHaveLength(2)
    for (const child of scene.children) expect(Number(gsap.getProperty(child, 'opacity'))).toBe(1)
    timeline.totalTime(4, false)
    expect(Number(gsap.getProperty(scene, 'opacity'))).toBe(1)
    timeline.totalTime(1, false)
    expect(Number(gsap.getProperty(scene, 'opacity'))).toBe(0)
  } finally {
    timeline.kill()
    artboard.remove()
    vi.unstubAllGlobals()
  }
})

it('rejects mismatched fade stages and conflicting group opacity data', async () => {
  await expect(convertTheBriefHtml(fadingSlides.replace('effInDuration:1000', 'effInDuration:500'))).rejects.toThrow('Slide transitions/stop')
  const result = await convertTheBriefHtml(fadingSlides)
  const board = result.canvasData.custom_300x250
  board.layers.findLast(layer => layer.slideFade)!.slideFade.duration = 0.5
  expect(() => parseTheBriefPackage({ kind: 'xeroflow-thebrief-import', version: 1, name: 'Invalid', source: { ...result.source, sha256: 'a'.repeat(64), folder: '' }, canvasData: result.canvasData, assets: [], fonts: [], warnings: [] })).toThrow('conflicting fades')
})

it('holds the layer entrance pose throughout its parent scene fade', async () => {
  const html = fadingSlides.replace('elements:[]}],customAnimations', 'elements:[{id:201,from:0}]}],customAnimations')
    .replace('<div id="c-201" class="content" style="background-color:#00f"></div>', '<div id="effIn201"><div id="c-201" class="content" style="background-color:#00f"></div></div>')
    + '<style>#effIn201{width:100%;height:100%;animation-name:zoom;animation-duration:1s;animation-delay:0s;animation-iteration-count:1;animation-direction:normal;animation-fill-mode:backwards;animation-timing-function:linear}@keyframes zoom{0%{transform:scale(2)}100%{transform:scale(1)}}</style>'
  const result = await convertTheBriefHtml(html)
  const zoom = result.canvasData.custom_300x250.layers.find(layer => layer.linkId === 'source:201')
  expect(zoom.keyframes.scaleX.slice(0, 2)).toMatchObject([{ time: 2, value: 2 }, { time: 3, value: 2 }])
})
