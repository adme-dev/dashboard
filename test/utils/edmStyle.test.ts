import { describe, it, expect } from 'vitest'
import {
  extendedStyleDeclarations,
  extendedStyleCss,
  extendedStyleVue,
  resolveBoxShadow,
  safeCssUrl,
  SHADOW_PRESETS
} from '~~/app/utils/edmStyle'

describe('extendedStyleDeclarations — omission (backwards-compat guarantee)', () => {
  it('returns nothing for null/empty style', () => {
    expect(extendedStyleDeclarations(null)).toEqual([])
    expect(extendedStyleDeclarations(undefined)).toEqual([])
    expect(extendedStyleDeclarations({})).toEqual([])
  })

  it('omits props that are null, undefined or empty string', () => {
    expect(extendedStyleDeclarations({
      lineHeight: null, letterSpacing: null, textTransform: null,
      opacity: null, borderWidth: null, borderStyle: null, boxShadow: null, backgroundImage: null
    })).toEqual([])
    expect(extendedStyleDeclarations({ lineHeight: '' as unknown as number })).toEqual([])
  })

  it('omits opacity when >= 1 (no visual change) and text-transform "none"', () => {
    expect(extendedStyleCss({ opacity: 1 })).toBe('')
    expect(extendedStyleCss({ textTransform: 'none' })).toBe('')
  })
})

describe('extendedStyleDeclarations — emission', () => {
  it('emits line-height, letter-spacing, text-transform, opacity', () => {
    const css = extendedStyleCss({ lineHeight: 1.6, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.5 })
    expect(css).toContain('line-height: 1.6;')
    expect(css).toContain('letter-spacing: 2px;')
    expect(css).toContain('text-transform: uppercase;')
    expect(css).toContain('opacity: 0.5;')
  })

  it('clamps opacity into [0,1]', () => {
    expect(extendedStyleCss({ opacity: -0.5 })).toContain('opacity: 0;')
    // 1.5 → >=1 path → omitted
    expect(extendedStyleCss({ opacity: 1.5 })).toBe('')
  })

  it('emits a composite border only when width AND style are meaningful', () => {
    expect(extendedStyleCss({ borderWidth: 2, borderStyle: 'solid', borderColor: '#abc123' }))
      .toContain('border: 2px solid #abc123;')
    // width without style → no border
    expect(extendedStyleCss({ borderWidth: 2 })).toBe('')
    // style none → no border
    expect(extendedStyleCss({ borderWidth: 2, borderStyle: 'none' })).toBe('')
    // defaults color to black when omitted
    expect(extendedStyleCss({ borderWidth: 1, borderStyle: 'dashed' })).toContain('border: 1px dashed #000000;')
  })

  it('emits border-radius independently of border', () => {
    expect(extendedStyleCss({ borderRadius: 8 })).toBe('border-radius: 8px;')
    expect(extendedStyleCss({ borderRadius: 0 })).toBe('')
  })

  it('resolves box-shadow presets and ignores unknown keys', () => {
    expect(extendedStyleCss({ boxShadow: 'md' })).toBe(`box-shadow: ${SHADOW_PRESETS.md};`)
    expect(extendedStyleCss({ boxShadow: 'none' })).toBe('')
    expect(extendedStyleCss({ boxShadow: 'bogus' })).toBe('')
  })
})

describe('safeCssUrl + background-image (injection safety)', () => {
  it('accepts http(s) urls', () => {
    expect(safeCssUrl('https://x.com/a.png')).toBe('https://x.com/a.png')
    expect(safeCssUrl('http://x.com/a.png')).toBe('http://x.com/a.png')
  })

  it('rejects javascript:/data:/relative and url-breaking chars', () => {
    expect(safeCssUrl('javascript:alert(1)')).toBeNull()
    expect(safeCssUrl('data:image/png;base64,xxx')).toBeNull()
    expect(safeCssUrl('/local.png')).toBeNull()
    expect(safeCssUrl('https://x.com/a.png")')).toBeNull()
    expect(safeCssUrl('https://x.com/a.png);background:url(evil')).toBeNull()
  })

  it('emits a safe background-image with cover/center, omits unsafe urls', () => {
    const css = extendedStyleCss({ backgroundImage: 'https://x.com/bg.jpg' })
    expect(css).toContain('background-image: url(https://x.com/bg.jpg);')
    expect(css).toContain('background-size: cover;')
    expect(css).toContain('background-position: center;')
    expect(extendedStyleCss({ backgroundImage: 'javascript:x' })).toBe('')
  })
})

describe('extendedStyleVue', () => {
  it('returns a camelCased CSSProperties object', () => {
    const vue = extendedStyleVue({ lineHeight: 1.4, letterSpacing: 1, boxShadow: 'sm', borderRadius: 4 })
    expect(vue).toMatchObject({
      lineHeight: '1.4',
      letterSpacing: '1px',
      boxShadow: SHADOW_PRESETS.sm,
      borderRadius: '4px'
    })
  })

  it('is empty for empty style', () => {
    expect(extendedStyleVue({})).toEqual({})
  })
})

describe('resolveBoxShadow', () => {
  it('maps known presets, nulls none/unknown/empty', () => {
    expect(resolveBoxShadow('lg')).toBe(SHADOW_PRESETS.lg)
    expect(resolveBoxShadow('none')).toBeNull()
    expect(resolveBoxShadow('')).toBeNull()
    expect(resolveBoxShadow(undefined)).toBeNull()
    expect(resolveBoxShadow('zzz')).toBeNull()
  })
})
