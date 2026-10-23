import { describe, expect, it } from 'vitest'
import { bannerEffectCss, bannerEffectRecipeSchema, effectStyleFromLayer, EFFECT_PRESETS } from '../../shared/bannerEffects'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import type { Layer } from '../../app/types/banner-studio'

describe('Banner effects', () => {
  it('accepts built-in recipes and legacy short colours', () => {
    for (const preset of EFFECT_PRESETS) expect(bannerEffectRecipeSchema.parse({ style: preset.style, prompt: '', modelId: 'aigateway/recraft-offer-card', referenceIds: [], referenceProjectId: null }).style).toEqual(preset.style)
    expect(effectStyleFromLayer({ color: '#fff', textShadow: '0px 2px 4px #000000' })).toMatchObject({ color: '#fff', textShadow: '0px 2px 4px #000000' })
  })
  it('discards hostile CSS while retaining valid independent effects', () => {
    const css = bannerEffectCss({ color: '#fff', textShadow: '" onload="alert(1)', textStroke: '1px #ffffff', visualFilter: 'url(https://evil.test)' })
    expect(css).toContain('-webkit-text-stroke:1px #ffffff')
    expect(css).not.toMatch(/alert|evil|onload/)
  })
  it('exports the same gradient direction, shadow, stroke and filter', () => {
    const layer = { id: 1, name: 'Headline', type: 'text', x: 0, y: 0, w: 300, h: 80, zIndex: 1, opacity: 1, text: 'EOFY', startTime: 0, endTime: 5, ...EFFECT_PRESETS.find(p => p.id === 'chrome')!.style, visualFilter: 'saturate(1.5)' } as Layer
    const html = buildBannerHTML('custom_300x250', [layer], { includeAnimations: false })
    expect(html).toContain('linear-gradient(to right,#ffffff,#64748b,#ffffff,#334155)')
    expect(html).toContain('text-shadow:0px 2px 2px #111827')
    expect(html).toContain('filter:saturate(1.5)')
    expect(html.indexOf('color:transparent')).toBeGreaterThan(html.indexOf('color:#ffffff'))
  })
})
