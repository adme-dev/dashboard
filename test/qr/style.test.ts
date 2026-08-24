import { describe, it, expect } from 'vitest'
import { QrStyleSchema, DEFAULT_STYLE } from '../../shared/qr/style'
import { QR_TEMPLATES } from '../../shared/qr/templates'

describe('QrStyleSchema', () => {
  it('accepts the default style', () => {
    expect(QrStyleSchema.parse(DEFAULT_STYLE)).toEqual(DEFAULT_STYLE)
  })
  it('fills defaults for a partial style', () => {
    const s = QrStyleSchema.parse({ pattern: 'circles' })
    expect(s.pattern).toBe('circles')
    expect(s.fg).toBe('#000000')
    expect(s.eye).toBe('square')
  })
  it('rejects bad hex colours', () => {
    expect(() => QrStyleSchema.parse({ fg: 'red' })).toThrow()
    expect(() => QrStyleSchema.parse({ fg: '#abc' })).toThrow()
  })
  it('rejects logo sizePct outside 10-25', () => {
    expect(() => QrStyleSchema.parse({ logo: { dataUri: 'data:image/png;base64,AA==', sizePct: 40 } })).toThrow()
  })
  it('rejects a logo that is not a png/svg data URI', () => {
    expect(() => QrStyleSchema.parse({ logo: { dataUri: 'https://x/y.png', sizePct: 20 } })).toThrow()
  })
  it('every template validates', () => {
    for (const t of QR_TEMPLATES) expect(() => QrStyleSchema.parse(t.style)).not.toThrow()
    expect(QR_TEMPLATES.length).toBeGreaterThanOrEqual(5)
  })
})
