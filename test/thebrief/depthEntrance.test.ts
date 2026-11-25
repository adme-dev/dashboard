import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'

const depth = source.replace('animation-delay:-1ms', 'animation-delay:0s')
  .replace('width:200px;height:80px}', 'width:200px;height:80px;perspective:500px;perspective-origin:center}')
  .replace('translateX(-100px) translateY(0)', 'translateZ(-200px) rotate(-45deg)')
  .replace('translateX(0) translateY(0)', 'translateZ(0) rotate(0)')
  .replace('data-eltype="text"', 'data-eltype="image"')
  .replace('<div class="row">Hello world</div>', '<div id="c-1" style="width:100%;height:100%;background-image:url(./original.png);background-size:cover"></div>')

it('retains perspective, depth and rotation as separate native GSAP tracks', async () => {
  const c = await convertTheBriefHtml(depth)
  expect(c.warnings).toEqual([])
  const layer = c.canvasData.custom_300x250.layers.find(l => l.type === 'image')
  expect(layer).toMatchObject({ imageFlipPerspective: 500, keyframes: {
    z: [{ time: .2, value: -200, easing: 'cubic-bezier(.165,.84,.44,1)' }, { time: 1.2, value: 0 }],
    rotation: [{ time: .2, value: -45, easing: 'cubic-bezier(.165,.84,.44,1)' }, { time: 1.2, value: 0 }]
  } })
  const html = client('mrec', [layer])
  expect(html).toContain('transformPerspective: 500')
  expect(html).toContain('z: -200')
  expect(server('mrec', [layer])).toBe(html)
})

it('holds unverified depth geometry, front-plane motion and transform ordering', async () => {
  for (const input of [depth.replace('perspective-origin:center', 'perspective-origin:left top'), depth.replace('translateZ(-200px)', 'translateZ(500px)'), depth.replace('translateZ(-200px) rotate(-45deg)', 'rotate(-45deg) translateZ(-200px)'), depth.replace('perspective:500px', 'perspective:none')]) {
    expect((await convertTheBriefHtml(input)).warnings).toContainEqual(expect.stringContaining('animation not converted'))
  }
})

it('preserves forward planar depth by rebasing the camera and scale together', async () => {
  const result = await convertTheBriefHtml(depth.replace('translateZ(-200px)', 'translateZ(200px)'))
  const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'image')
  expect(result.warnings).toEqual([])
  expect(layer.imageFlipPerspective).toBe(300)
  expect(layer.keyframes.z.map(f => f.value)).toEqual([0, -200])
  for (const z of [0, 85, 200]) {
    expect(layer.keyframes.scaleX[0].value * 300 / (300 - (z - 200))).toBeCloseTo(500 / (500 - z), 10)
  }
})

it('retains the native border and 3D rotation of a projected shape', async () => {
  const html = depth.replace('data-eltype="image"', 'data-eltype="shape"')
    .replace('background-image:url(./original.png);background-size:cover', 'border:3px solid #fff;border-radius:54px')
    .replace('rotate(-45deg)', 'rotateX(90deg)').replace('rotate(0)', 'rotateX(0)')
  const result = await convertTheBriefHtml(html)
  const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'button')
  expect(layer).toMatchObject({ borderWidth: 3, borderRadius: 54, imageFlipPerspective: 500 })
  expect(layer.keyframes.rotationX.map(frame => frame.value)).toEqual([90, 0])
  expect(layer.keyframes.z.map(frame => frame.value)).toEqual([-200, 0])
  expect(server('mrec', [layer])).toBe(client('mrec', [layer]))
})
