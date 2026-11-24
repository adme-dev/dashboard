import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import { source } from './fixture'

const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%"><circle fill="#1A1A1A" cx="200" cy="200" r="200"/></svg>'
function fixture(svg = circle, extra = '') {
  return source.replace('data-eltype="text"', 'data-eltype="image"').replace('height:80px', 'height:200px')
    .replace('<div class="row">Hello world</div>', '<div class="mask"><img src="./media/logo.png" style="width:100%;height:100%;object-fit:cover"></div>')
    + `<style>.mask{width:100%;height:100%;mask-image:url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}");mask-size:100% 100%;mask-repeat:no-repeat;mask-position:center;mask-mode:match-source;${extra}}</style>`
}

it('preserves original image bytes, editable motion and circular source clipping in both exporters', async () => {
  const result = await convertTheBriefHtml(fixture())
  const image = result.canvasData.custom_300x250.layers.find(l => l.type === 'image')
  expect(image).toMatchObject({ src: './media/logo.png', w: 200, h: 200, borderRadius: 100 })
  expect(image.keyframes.x.length).toBeGreaterThan(1)
  expect(client('mrec', [image])).toContain('border-radius:100px;overflow:hidden;')
  expect(server('mrec', [image])).toBe(client('mrec', [image]))
})

it.each([
  [circle.replace('r="200"', 'r="100"'), ''],
  [circle.replace('fill="#1A1A1A"', 'fill="#1A1A1A" opacity="0.5"'), ''],
  [circle.replace('</svg>', '<rect width="400" height="400"/></svg>'), ''],
  [circle.replace('width="100%"', 'width="50%"'), ''],
  [circle, 'mask-size:50% 50%'],
  [circle, 'mask-position:left'],
  [circle, 'mask-repeat:repeat'],
  [circle, 'mask-mode:luminance'],
  [circle, 'mask-composite:subtract'],
  [circle, 'padding:10px'],
  [circle, 'filter:blur(2px)'],
])('holds unsupported image-mask composition %s %s', async (svg, extra) => {
  await expect(convertTheBriefHtml(fixture(svg, extra))).rejects.toThrow(/mask|Masked/)
})
