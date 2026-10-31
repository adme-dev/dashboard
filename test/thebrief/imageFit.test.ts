// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'

const image = source.replace('data-eltype="text"', 'data-eltype="image"')
  .replace('<div class="row">Hello world</div>', '<div id="c-1"></div>')

it.each(['contain', 'cover'])('preserves a centered image background using %s', async (fit) => {
  const result = await convertTheBriefHtml(image + `<style>#c-1{width:100%;height:100%;background-image:url(./media/art.png);background-size:${fit};background-position:50% 50%;background-repeat:no-repeat}</style>`)
  expect(result.canvasData.custom_300x250.layers.find(layer => layer.type === 'image').fit).toBe(fit)
})

it('holds offset image composition that cannot be expressed by the import schema', async () => {
  await expect(convertTheBriefHtml(image + '<style>#c-1{background-image:url(./media/art.png);background-size:contain;background-position:20% 50%;background-repeat:no-repeat}</style>'))
    .rejects.toThrow('Unsupported image background fit/position')
})

it.each([
  ['rotate(0) scale(-1,1)', '20% 50%'],
  ['rotate(20deg) scale(-1,1)', '50% 50%'],
  ['translateZ(-800px) rotateX(90deg)', '50% 50%'],
  ['rotate(0) scale(-1,2)', '50% 50%']
])('holds image transform %s with origin %s', async (transform, origin) => {
  const html = source.replace('data-eltype="text"', 'data-eltype="image"')
    .replace('<div class="row">Hello world</div>', `<div style="width:100%;height:100%;transform:${transform};transform-origin:${origin}"><img src="./art.png"></div>`)
  await expect(convertTheBriefHtml(html)).rejects.toThrow('Unsupported static transform')
})
