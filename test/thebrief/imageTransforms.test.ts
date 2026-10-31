// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { createApp, h, computed } from 'vue'
import ImageLayer from '../../app/components/banner/layers/Image.client.vue'
import { isSafeBannerImageFilter } from '../../shared/bannerImageFilters.mjs'
import { bannerEffectStyleSchema, bannerEffectCss } from '../../shared/bannerEffects'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as serverHTML } from '../../server/utils/banner/htmlBuilder'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'
import type { Layer } from '../../app/types/banner-studio'

it('retains nested static image opacity across entrance and settled native frames', async () => {
  const html = source.replace('data-eltype="text"', 'data-eltype="image"')
    .replace('<div class="row">Hello world</div>', '<div style="opacity:.5"><img style="opacity:.6" src="./art.png"></div>')
  const c = await convertTheBriefHtml(html)
  const image = c.canvasData.custom_300x250.layers.find(layer => layer.type === 'image')
  expect(image.opacity).toBe(0.3)
  expect(image.keyframes.opacity.map(frame => frame.value)).toEqual([0, 0.3, 0.3])
})

it('retains a supported static screen-overlay filter separately from its blend mode', async () => {
  const html = source.replace('data-eltype="text"', 'data-eltype="image" style="mix-blend-mode:screen"')
    .replace('<div class="row">Hello world</div>', '<div style="filter:brightness(1.07) contrast(1.48) saturate(1) hue-rotate(0deg)"><img src="./art.png"></div>')
  const c = await convertTheBriefHtml(html)
  const image = c.canvasData.custom_300x250.layers.find(layer => layer.type === 'image')
  expect(image.mixBlendMode).toBe('screen')
  expect(image.visualFilter).toBe('brightness(1.07) contrast(1.48) saturate(1) hue-rotate(0deg)')
  expect(c.imageTransforms).toEqual([])
})

it('preserves ordered hue and shadow filters through package validation, editor rendering and both exporters', async () => {
  const filter = 'brightness(1.07) contrast(1.48) saturate(1) hue-rotate(-44deg) drop-shadow(2px 2px 54px rgba(0, 44, 94, .5))'
  const html = source.replace('data-eltype="text"', 'data-eltype="image"')
    .replace('<div class="row">Hello world</div>', `<div style="opacity:.3;filter:${filter}"><img src="./art.png"></div>`)
  const c = await convertTheBriefHtml(html)
  const pkg = parseTheBriefPackage({ kind: 'xeroflow-thebrief-import', version: 1, name: 'Image filters', source: { designHash: 'filter', sha256: 'a'.repeat(64), folder: '', duration: 4, loopCount: 0 }, canvasData: c.canvasData, warnings: c.warnings, assets: [{ path: './art.png', fileName: 'art.png', sha256: 'b'.repeat(64), base64: 'AA==', mimeType: 'image/png' }], fonts: [] })
  const image = pkg.canvasData.custom_300x250.layers.find(layer => layer.type === 'image')
  expect(image.visualFilter).toBe(filter)
  const output = buildBannerHTML('custom_300x250', [image] as Layer[])
  expect(output).toContain(`filter:${filter};`)
  expect(serverHTML('custom_300x250', [image] as Layer[])).toBe(output)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useBannerFeeds', () => ({ getFeedOverride: () => undefined }))
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(ImageLayer, { layer: image as Layer, isActive: true }) })
  try {
    app.mount(host)
    const node = host.firstElementChild as HTMLElement
    expect(node.style.filter).toBe(filter)
    // GSAP applies the opacity track on the outer artboard layer. The image
    // content must not multiply .3 by .3 for a second time.
    expect(node.style.opacity).toBe('1')
    expect(image.keyframes.opacity.at(-1).value).toBe(0.3)
  } finally {
    app.unmount()
    host.remove()
    vi.unstubAllGlobals()
  }
})

it.each(['brightness(1.07) url(https://example.com)', 'brightness(5)', 'hue-rotate(361deg)', 'blur(129px)', 'drop-shadow(0px 0px 54px rgba(0,0,0,2))', 'drop-shadow(0px 0px 54px var(--color))', 'drop-shadow(257px 0px 1px #fff)', 'brightness(1);color:red', 'brightness(1)/**/', 'brightness(Infinity)', 'drop-shadow(0px 0px 54px #fff)'.repeat(9)])('holds unsupported static image filter %s', async (filter) => {
  expect(isSafeBannerImageFilter(filter)).toBe(false)
  expect(bannerEffectStyleSchema.safeParse({ visualFilter: filter }).success).toBe(false)
  expect(bannerEffectCss({ visualFilter: filter })).not.toContain('filter:')
  const html = source.replace('data-eltype="text"', 'data-eltype="image"')
    .replace('<div class="row">Hello world</div>', `<img style="filter:${filter}" src="./art.png">`)
  // CSS parsers may discard invalid declarations entirely; values retained by
  // the source parser must never bypass the package/export validator.
  if (!filter.includes(';')) await expect(convertTheBriefHtml(html)).rejects.toThrow('Unsupported static image filter')
})
