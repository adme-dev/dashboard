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
  for (const input of [depth.replace('perspective-origin:center', 'perspective-origin:left top'), depth.replace('translateZ(-200px)', 'translateZ(200px)'), depth.replace('translateZ(-200px) rotate(-45deg)', 'rotate(-45deg) translateZ(-200px)'), depth.replace('perspective:500px', 'perspective:none')]) {
    expect((await convertTheBriefHtml(input)).warnings).toContainEqual(expect.stringContaining('animation not converted'))
  }
})
