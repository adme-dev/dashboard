import { describe, expect, it } from 'vitest'
import type { BannerBrandKit } from '~/types/banner-studio'
import { buildBrandTemplateLayers } from '~/utils/banner-brand-templates'
import { chooseMotorstackPreview } from '~/utils/banner-brand-preview-media'
import { brandGuideText, motorstackBrandId } from '~~/shared/bannerBrandGuides'

const kit = {
  id: 'ldv-kit', name: 'LDV Australia', clientId: null, sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=ldv',
  colors: [{ role: 'primary', hex: '#bc3219' }, { role: 'accent', hex: '#bc3219' }],
  fonts: [{ role: 'heading', family: 'Knockout-28', weights: [400], defaultWeight: 400 }, { role: 'body', family: 'Open Sans', weights: [400] }, { role: 'extra', family: 'Knockout-68', weights: [400] }],
  logos: [{ name: 'LDV dark mark', url: '/dark.png', r2Key: 'dark', variant: 'dark' }, { name: 'LDV light mark', url: '/light.png', r2Key: 'light', variant: 'light' }]
} as BannerBrandKit

describe('brand templates', () => {
  it('chooses a real exterior vehicle image over brochures and interior images', () => {
    const selected = chooseMotorstackPreview({
      models: ['All-New Navara'],
      assets: [
        { id: 'brochure', name: 'brochure.pdf', mime: 'application/pdf', importable: false, previewUrl: '/brochure' },
        { id: 'interior', name: 'Navara interior.jpg', mime: 'image/jpeg', importable: true, previewUrl: '/interior' },
        { id: 'hero', name: 'All-New Navara hero exterior.png', mime: 'image/png', importable: true, previewUrl: '/hero' }
      ]
    })
    expect(selected).toMatchObject({ asset: { id: 'hero' }, model: 'All-New Navara' })
    expect(chooseMotorstackPreview({ models: ['Ariya'], assets: [{ id: 'hero', name: 'Navara hero.png', mime: 'image/png', importable: true, previewUrl: '/hero' }] })).toBeNull()
  })
  it('excludes promotional artwork and prefers the campaign vehicle', () => {
    const asset = (id: string, name: string) => ({ id, name, mime: 'image/webp', importable: true, previewUrl: '/' + id })
    const selected = chooseMotorstackPreview({ models: ['Ranger', 'Everest'], assets: [asset('bad', 'Black Friday Deals · hero'), asset('promo', 'Ranger sale offer · hero'), asset('everest', 'Everest · hero'), asset('wolftrak', 'Ranger Wolftrak · hero')] }, 'Ford / Ranger Wolftrak')
    expect(selected).toMatchObject({ asset: { id: 'wolftrak' }, model: 'Ranger' })
  })

  it('separates vehicle, text, buttons and dealer across the normal three sizes', () => {
    const ford = { ...kit, name: 'Ford Australia', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=ford' } as BannerBrandKit
    for (const fmt of [{ w: 300, h: 250 }, { w: 1080, h: 1080 }, { w: 1080, h: 1920 }, { w: 728, h: 90 }, { w: 970, h: 250 }]) {
      for (const variant of ['hero', 'dual-cta'] as const) {
        const layers = buildBrandTemplateLayers(ford, fmt, variant, '/car.webp', 'Courtney & Patterson Ford')
        const visible = layers.filter(layer => layer.type !== 'bg')
        expect(layers.find(layer => layer.name === 'Dealer name')).toMatchObject({ text: 'Courtney & Patterson Ford', locked: true })
        expect(layers.find(layer => layer.name === 'MotorStack vehicle')).toMatchObject({ animIn: 'slideR', animInDur: 0.65, endTime: 8 })
        for (const [index, a] of visible.entries()) {
          expect(a.x! + a.w!).toBeLessThanOrEqual(fmt.w)
          expect(a.y! + a.h!).toBeLessThanOrEqual(fmt.h)
          for (const b of visible.slice(index + 1)) {
            const intersects = a.x! < b.x! + b.w! && b.x! < a.x! + a.w! && a.y! < b.y! + b.h! && b.y! < a.y! + a.h!
            expect(intersects, `${fmt.w}x${fmt.h} ${variant}: ${a.name} overlaps ${b.name}`).toBe(false)
          }
        }
      }
    }
  })
  it('uses the verified LDV CTA and contrast rules on light and dark layouts', () => {
    const light = buildBrandTemplateLayers(kit, { w: 300, h: 250 }, 'hero')
    const dark = buildBrandTemplateLayers(kit, { w: 300, h: 250 }, 'dual-cta')
    expect(light.find(layer => layer.type === 'bg')?.bgColor).toBe('#ffffff')
    expect(light.find(layer => layer.name === 'Headline')?.fontFamily).toBe('Knockout-28')
    expect(light.find(layer => layer.type === 'image')?.src).toBe('/light.png')
    expect(light.find(layer => layer.name === 'Primary CTA')).toMatchObject({ bgColor: '#bc3219', textColor: '#ffffff', borderRadius: 0, fontFamily: 'Open Sans', fontWeight: 700 })
    expect(dark.find(layer => layer.type === 'bg')?.bgColor).toBe('#000000')
    expect(dark.find(layer => layer.type === 'image')?.src).toBe('/dark.png')
    expect(dark.find(layer => layer.name === 'Secondary CTA')).toMatchObject({ bgColor: '#ffffff', textColor: '#000000', borderRadius: 0 })
  })

  it('fits the generated CTA layers inside compact formats', () => {
    const layers = buildBrandTemplateLayers(kit, { w: 160, h: 200 }, 'dual-cta')
    for (const button of layers.filter(layer => layer.type === 'button')) {
      expect((button.x || 0) + (button.w || 0)).toBeLessThanOrEqual(160)
      expect((button.y || 0) + (button.h || 0)).toBeLessThanOrEqual(200)
    }
  })

  it('derives other brand layouts from their own kit without applying LDV rules', () => {
    const other = { ...kit, name: 'Other', sourceUrl: null, colors: [{ role: 'accent', hex: '#117744' }] } as BannerBrandKit
    const layers = buildBrandTemplateLayers(other, { w: 300, h: 250 }, 'hero')
    expect(layers.find(layer => layer.name === 'Primary CTA')?.bgColor).toBe('#117744')
    expect(layers.find(layer => layer.name === 'Primary CTA')?.fontFamily).toBe('Knockout-28')
  })

  it('uses Nissan monochrome pill actions and a managed MotorStack car image', () => {
    const nissan = { ...kit, name: 'Nissan Australia', sourceUrl: 'https://oem-variants.pages.dev/api/mcp#brand=nissan' } as BannerBrandKit
    const layers = buildBrandTemplateLayers(nissan, { w: 970, h: 250 }, 'hero', '/api/assets/navara.png')
    expect(layers.find(layer => layer.name === 'MotorStack vehicle')?.src).toBe('/api/assets/navara.png')
    expect(layers.find(layer => layer.name === 'Primary CTA')).toMatchObject({ bgColor: '#000000', textColor: '#ffffff', borderRadius: 40, textTransform: 'none' })
    expect(layers.find(layer => layer.name === 'Headline')?.text).toContain('Nissan Australia')
  })
})

describe('MotorStack guide provenance', () => {
  it('attaches reviewed guides only to trusted MotorStack identifiers', () => {
    expect(motorstackBrandId(kit.sourceUrl)).toBe('ldv')
    expect(motorstackBrandId('https://example.com/api/mcp#brand=ldv')).toBe(null)
    expect(brandGuideText('ldv')).toContain('minimum 170px')
    expect(brandGuideText('ford')).toContain('Skyview blue')
    expect(brandGuideText('unknown')).toBe('')
  })
})
