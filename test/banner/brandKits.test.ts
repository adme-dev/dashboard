import { describe, it, expect } from 'vitest'
import { brandColor, brandFont, isLogoLayer, isDarkColor, normaliseHex } from '~~/app/utils/banner-brand-kit'
import { brandDriftRules } from '~~/server/utils/banner/brandDrift'
import { brandContextBlock, normaliseKitRow, brandKitInputSchema } from '~~/server/utils/banner/brandKits'

const kit = {
  name: 'Leapmotor',
  colors: [
    { role: 'primary', hex: '#ffffff' },
    { role: 'accent', hex: '#34e52e', label: 'Leap green' },
    { role: 'background', hex: '#0a0a10' }
  ],
  fonts: [{ role: 'heading', family: 'Barlow Condensed', weights: [700] }],
  logos: [],
  guidelines: 'Never abbreviate the brand name.'
} as any

describe('brand kit role lookup', () => {
  it('resolves roles with fallbacks', () => {
    expect(brandColor(kit, 'accent')).toBe('#34e52e')
    expect(brandColor(kit, 'secondary')).toBe('#ffffff') // falls back to primary
    expect(brandColor({ colors: [{ role: 'background', hex: '#f5f5f5' }, { role: 'text', hex: '#000000' }] } as any, 'primary')).toBe('#000000') // never the background
    expect(brandColor(kit, 'text')).toBeUndefined() // no text/secondary → undefined, apply leaves layer alone
    expect(brandFont(kit, 'body')?.family).toBe('Barlow Condensed') // body falls back to heading
  })
  it('detects logo layers by flag or name', () => {
    expect(isLogoLayer({ type: 'image', name: 'Brand logo' } as any)).toBe(true)
    expect(isLogoLayer({ type: 'image', name: 'Hero', isLogo: true } as any)).toBe(true)
    expect(isLogoLayer({ type: 'image', name: 'Hero' } as any)).toBe(false)
    expect(isLogoLayer({ type: 'text', name: 'logo' } as any)).toBe(false)
  })
  it('normalises hex input forms', () => {
    expect(normaliseHex('ABC')).toBe('#aabbcc')
    expect(normaliseHex('#AaBbCc')).toBe('#aabbcc')
    expect(normaliseHex('rgb(255, 0, 0)')).toBe('#ff0000')
    expect(normaliseHex('nope')).toBeNull()
    expect(isDarkColor('#0a0a10')).toBe(true)
    expect(isDarkColor('#ffffff')).toBe(false)
  })
})

describe('legacy row normalisation', () => {
  it('maps v1 string palettes and role-less fonts', () => {
    const row = normaliseKitRow({ colors: ['#111111', '#eeeeee'], fonts: [{ family: 'Inter', weights: [400] }], logos: null } as any)
    expect(row.colors).toEqual([{ role: 'primary', hex: '#111111' }, { role: 'background', hex: '#eeeeee' }])
    expect(row.fonts[0].role).toBe('heading')
    expect(row.logos).toEqual([])
  })
  it('validates input strictly', () => {
    expect(brandKitInputSchema.safeParse({ name: 'x', colors: [{ role: 'primary', hex: '#12345' }] }).success).toBe(false)
    expect(brandKitInputSchema.safeParse({ name: 'x', colors: [{ role: 'primary', hex: '#123456' }] }).success).toBe(true)
    expect(brandKitInputSchema.safeParse({ name: '' }).success).toBe(false)
  })
})

describe('AI brand context', () => {
  it('builds a prompt block with colours, fonts and guidelines', () => {
    const block = brandContextBlock(kit)
    expect(block).toContain('accent (Leap green) #34e52e')
    expect(block).toContain('heading: Barlow Condensed')
    expect(block).toContain('Never abbreviate')
  })
  it('is empty without a kit', () => {
    expect(brandContextBlock(null)).toBe('')
  })
})

describe('brand drift lint', () => {
  const layers = [
    { type: 'text', name: 'Headline', color: '#ffffff', fontFamily: 'Barlow Condensed' },
    { type: 'button', name: 'CTA', bgColor: '#36e630', textColor: '#000000', fontFamily: 'Comic Sans MS' }, // near-accent, off font
    { type: 'text', name: 'Legal', color: '#ff0000', fontFamily: 'Barlow Condensed' }
  ]
  it('flags off-palette colours and off-kit fonts, tolerating near matches and neutrals', () => {
    const rules = brandDriftRules(layers, kit)
    expect(rules.map(r => r.id)).toEqual(['brand-color-ff0000', 'brand-font-comic-sans-ms'])
    expect(rules[0].message).toContain('Legal')
    expect(rules.every(r => r.severity === 'warning')).toBe(true)
  })
  it('is silent without a kit', () => {
    expect(brandDriftRules(layers, null)).toEqual([])
  })
})
