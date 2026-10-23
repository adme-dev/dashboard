import { describe, expect, it } from 'vitest'
import { bannerEffectStyleSchema, bannerEffectCss, bannerTextDepthShadow, bannerTextMarkup } from '../../shared/bannerEffects'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as buildServerHTML } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

const depth = { size: 8, angle: 45, color: '#543515', bevel: 1, lightAngle: -45, shadow: 6, shadowOpacity: 0.4 }

describe('Font-preserving dimensional headings', () => {
  it('bounds expensive extrusion and rejects invalid settings and CSS', () => {
    expect(bannerEffectStyleSchema.safeParse({ textDepth: depth }).success).toBe(true)
    for (const invalid of [{ size: 10000 }, { angle: Infinity }, { color: 'url(evil)' }, { bevel: -1 }, { shadowOpacity: 2 }]) {
      expect(bannerEffectStyleSchema.safeParse({ textDepth: { ...depth, ...invalid } }).success).toBe(false)
      expect(bannerTextDepthShadow({ textDepth: { ...depth, ...invalid } })).toBe('')
    }
  })
  it('builds a continuous extrusion in either direction, with independently bounded lighting and shadow', () => {
    const right = bannerTextDepthShadow({ textDepth: { ...depth, angle: 0 } })
    expect(right).toContain('8px 0px 0px #543515')
    expect(right).toContain('1px 0px 0px #543515')
    expect(right).toContain('rgba(0,0,0,0.4)')
    expect(bannerTextDepthShadow({ textDepth: { ...depth, angle: 180 } })).toContain('-8px 0px 0px #543515')
    expect(bannerTextDepthShadow({ textDepth: { ...depth, size: 0, bevel: 0, shadow: 0 } })).toBe('')
  })
  it('keeps decorative glyphs inaccessible and the original face above the extrusion', () => {
    const markup = bannerTextMarkup('OPEN SUNDAY', { textDepth: depth })
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('pointer-events:none')
    expect(markup).toContain('position:relative')
    expect(markup).not.toContain('<img')
    expect(bannerTextMarkup('Plain', {})).toBe('Plain')
  })
  it('masks an AI texture through native lettering, with a visible fallback and no opaque rectangle', () => {
    const css = bannerEffectCss({ color: '#ffd86b', textTexture: 'https://assets.example.com/fire.png', textDepth: depth })
    expect(css).toContain('background-image:url(')
    expect(css).toContain('background-clip:text')
    expect(css).toContain('background-color:#ffd86b')
    expect(css).not.toContain('background-color:#000')
    expect(bannerTextMarkup('SAFE', { textTexture: 'https://assets.example.com/texture.png?a=1&token=2' })).toContain('?a=1&amp;token=2')
    expect(bannerTextMarkup('SAFE', { textTexture: 'https://evil.test/&apos;;color:red' })).toContain('&amp;apos;')
    for (const url of ['javascript:alert(1)', 'https://evil.test/";color:red', 'https://evil.test/<style>', 'data:image/svg+xml,evil']) {
      expect(bannerEffectCss({ textTexture: url })).not.toContain('url(')
    }
  })
  it('exports the same font, inline superscript, case, spacing and geometry in both renderers', () => {
    const layer = { id: 16, name: 'Sunday', type: 'text', text: 'open sunday*', textRuns: [{ text: 'open sunday' }, { text: '*', fontSize: 18, top: -10 }], x: 125, y: 725, w: 750, h: 40, opacity: 1, zIndex: 16, fontFamily: 'Client Custom Bold', fontSize: 44, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', textDepth: depth, startTime: 0, endTime: 6 } as Layer
    for (const builder of [buildBannerHTML, buildServerHTML]) {
      const html = builder('custom_1000x1000', [layer], { includeAnimations: false })
      expect(html).toContain('font-family:\'Client Custom Bold\'')
      expect(html).toContain('font-weight:800')
      expect(html).toContain('text-transform:uppercase')
      expect(html).toContain('letter-spacing:2px')
      expect(html).toContain('width:750px;height:40px')
      expect(html).toContain('font-size:18px;position:relative;top:-10px')
      expect(html).toContain(bannerTextDepthShadow(layer as unknown as Record<string, unknown>))
      expect(html).toContain('aria-hidden="true"')
    }
    expect(layer.type).toBe('text')
  })
})
