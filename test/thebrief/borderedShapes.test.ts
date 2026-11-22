import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'

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
