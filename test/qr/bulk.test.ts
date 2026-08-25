import { describe, it, expect } from 'vitest'
import { BULK_MAX_VARIANTS, BulkQrSchema, expandName, expandNames, numberedVariants, parseVariantsInput } from '../../shared/qr/bulk'

const base = { clientId: '11111111-1111-4111-8111-111111111111', baseName: 'Autumn sale', destinationUrl: 'https://example.com', variants: ['Window', 'Counter'] }

describe('parseVariantsInput', () => {
  it('splits on newlines, commas and semicolons, trims, de-duplicates case-insensitively', () => {
    expect(parseVariantsInput(' Window\nCounter, counter;Flyer\n\n')).toEqual(['Window', 'Counter', 'Flyer'])
  })
  it('caps at the maximum', () => {
    expect(parseVariantsInput(Array.from({ length: 300 }, (_, i) => `v${i}`).join('\n'))).toHaveLength(BULK_MAX_VARIANTS)
  })
})

describe('numberedVariants', () => {
  it('zero-pads to the width of the count', () => {
    expect(numberedVariants(3)).toEqual(['1', '2', '3'])
    expect(numberedVariants(12, 'Table ')).toEqual(expect.arrayContaining(['Table 01', 'Table 12']))
    expect(numberedVariants(12)).toHaveLength(12)
    expect(numberedVariants(0)).toEqual([])
  })
})

describe('expandName', () => {
  it('substitutes base, variant and index', () => {
    expect(expandName('{base} – {variant}', 'Sale', 'Window', 0)).toBe('Sale – Window')
    expect(expandName('{variant} #{n}', 'Sale', 'Window', 4)).toBe('Window #5')
    expect(expandNames('{base}/{variant}', 'A', ['x', 'y'])).toEqual(['A/x', 'A/y'])
  })
  it('falls back when the pattern renders empty', () => {
    expect(expandName('   ', 'Sale', 'Window', 0)).toBe('Sale – Window')
  })
})

describe('BulkQrSchema', () => {
  it('requires a campaign id or name', () => {
    expect(BulkQrSchema.safeParse(base).success).toBe(false)
    expect(BulkQrSchema.safeParse({ ...base, campaignName: 'Autumn' }).success).toBe(true)
    expect(BulkQrSchema.safeParse({ ...base, campaignId: base.clientId }).success).toBe(true)
  })
  it('rejects duplicate variants and empty lists', () => {
    expect(BulkQrSchema.safeParse({ ...base, campaignName: 'x', variants: ['a', 'A'] }).success).toBe(false)
    expect(BulkQrSchema.safeParse({ ...base, campaignName: 'x', variants: [] }).success).toBe(false)
  })
  it('defaults pattern, style, frame and utm', () => {
    const v = BulkQrSchema.parse({ ...base, campaignName: 'x' })
    expect(v.namePattern).toBe('{base} – {variant}')
    expect(v.frame.style).toBe('none')
    expect(v.utmEnabled).toBe(true)
  })
})
