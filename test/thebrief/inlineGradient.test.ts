import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { isBannerInlineTextGradient } from '../../shared/bannerTextColor.mjs'
import { bannerTextRunStyle } from '../../shared/bannerWordPop'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import { source } from './fixture'
const gradient = 'linear-gradient(180deg, #ffe500 36%, #ff7300 100%)'
const input = (fill: string) => source.replace('Hello world', `<span style="background-image:${fill};background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent">Hello world</span>`)
it('retains the inline paint box and editable text instead of applying the gradient to the whole row', async () => {
  const result = await convertTheBriefHtml(input(gradient))
  const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'text')
  expect(layer.textRuns).toEqual([{ text: 'Hello world', gradient }])
  expect(bannerTextRunStyle(layer.textRuns[0])).toMatchObject({ backgroundImage: gradient, backgroundClip: 'text', WebkitTextFillColor: 'transparent' })
  const html = client('mrec', [layer])
  expect(html).toContain(`<span style="color:transparent;background-image:${gradient};`)
  expect(server('mrec', [layer])).toBe(html)
})
it('rejects external images, injected CSS and invalid gradient stops', async () => {
  for (const value of ['url(https://example.com/a)', 'linear-gradient(180deg, #ffe500 101%, #ff7300 100%)', 'linear-gradient(180deg, #ffe500 80%, #ff7300 20%)', gradient+';color:red', 'linear-gradient(999deg, #ffe500 0%, #ff7300 100%)']) expect(isBannerInlineTextGradient(value)).toBe(false)
  await expect(convertTheBriefHtml(input('linear-gradient(180deg, #ffe500 80%, #ff7300 20%)'))).rejects.toThrow('Gradient or clipped')
})
