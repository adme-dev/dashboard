import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'

function shapeSource(border = 'border:10px solid #fff') {
  return source.replace('data-eltype="text"', 'data-eltype="shape"')
    .replace('<div id="effIn1"><div class="row">Hello world</div></div>', `<div id="c-1" style="width:100%;height:100%;background-color:#0a0a0a;${border};border-radius:40px"></div>`)
}

it('retains solid uniform borders and corners as an editable native layer', async () => {
  const result = await convertTheBriefHtml(shapeSource())
  expect(result.canvasData.custom_300x250.layers.find(layer => layer.name === 'Bordered shape 1')).toMatchObject({
    type: 'button', text: '', w: 200, h: 80, borderWidth: 10, borderColor: '#fff', borderRadius: 40, bgColor: '#0a0a0a'
  })
})

it('holds asymmetric borders that the native layer cannot reproduce', async () => {
  await expect(convertTheBriefHtml(shapeSource('border:10px solid #fff;border-left-width:2px'))).rejects.toThrow('shape border composition')
})

it('preserves a bordered shape shadow around its border in both native exports', async () => {
  const result = await convertTheBriefHtml(shapeSource('border:4px solid #e70357;filter:drop-shadow(11px 11px 0px #e70357)'))
  const layer = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'button')
  expect(layer).toMatchObject({ text: '', borderWidth: 4, visualFilter: 'drop-shadow(11px 11px 0px #e70357)' })
  const html = client('mrec', [layer])
  expect(html).toContain('filter:drop-shadow(11px 11px 0px #e70357);')
  expect(html).toContain('border:4px solid #e70357;')
  expect(server('mrec', [layer])).toBe(html)
})

it('preserves the source border-box gradient', async () => {
  const gradient = 'linear-gradient(0deg,#ff0026 1%,#ffc300 100%)'
  const html = shapeSource('border:4px solid #fff;background-image:' + gradient + ';background-color:initial;background-position:-4px -4px;background-size:calc(100% + 8px) calc(100% + 8px)')
  const result = await convertTheBriefHtml(html)
  const layer = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'button')
  expect(layer).toMatchObject({ borderWidth: 4, bgColor: 'linear-gradient(0deg, #ff0026 1%, #ffc300 100%) border-box' })
  expect(client('mrec', [layer])).toBe(server('mrec', [layer]))
  await expect(convertTheBriefHtml(html.replace('-4px -4px', '-3px -4px'))).rejects.toThrow('Unsupported gradient shape composition')
})
