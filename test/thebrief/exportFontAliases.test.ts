import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'

function fontSource(first = 'Example Font file-face-1') {
  return source.replace('<style>', '<style>@font-face{font-family:"Example Font";font-weight:700;font-style:normal;src:url("./fonts/example.ttf") format("truetype")}')
    .replace('font-family:Arial', `font-family:"${first}","Example Font"`)
}

it('binds the export-only alias to its packaged font family and exact weight', async () => {
  const result = await convertTheBriefHtml(fontSource())
  const layer = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'text')
  expect(layer.fontFamily).toBe('Example Font')
  expect(result.fonts).toContainEqual(expect.objectContaining({ family: layer.fontFamily, weight: layer.fontWeight, path: './fonts/example.ttf' }))
})

it('does not guess an unrelated fallback family', async () => {
  await expect(convertTheBriefHtml(fontSource('Unrelated Font'))).rejects.toThrow('ambiguous export font alias')
})

it('uses the explicitly declared first-choice alias at the matching weight', async () => {
  const html = fontSource().replace('<style>', '<style>@font-face{font-family:"Example Font file-face-1";font-weight:700;font-style:normal;src:url("./fonts/first.ttf") format("truetype")}')
  const result = await convertTheBriefHtml(html)
  const layer = result.canvasData.custom_300x250.layers.find(layer => layer.type === 'text')
  expect(layer.fontFamily).toBe('Example Font file-face-1')
  expect(result.fonts).toContainEqual(expect.objectContaining({ family: layer.fontFamily, path: './fonts/first.ttf' }))
})
