import { describe, expect, it } from 'vitest'
import { safeMediaUrl, safeMondayUrl, safePublicUrl, safeUrl } from '~~/app/utils/safe-url'

describe('safe-url utilities', () => {
  it('rejects empty nullish URL strings', () => {
    expect(safeUrl(null)).toBeUndefined()
    expect(safeUrl(undefined)).toBeUndefined()
    expect(safeUrl('')).toBeUndefined()
    expect(safeUrl(' null ')).toBeUndefined()
    expect(safeUrl('undefined')).toBeUndefined()
  })

  it('allows public http URLs only for public links', () => {
    expect(safePublicUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(safePublicUrl('http://example.com/path')).toBe('http://example.com/path')
    expect(safePublicUrl('/relative/path')).toBeUndefined()
    expect(safePublicUrl('javascript:alert(1)')).toBeUndefined()
    expect(safePublicUrl('data:text/plain,hello')).toBeUndefined()
  })

  it('allows relative and preview media URLs for media surfaces', () => {
    expect(safeMediaUrl('/uploads/file.png')).toBe('/uploads/file.png')
    expect(safeMediaUrl('//example.com/file.png')).toBeUndefined()
    expect(safeMediaUrl('blob:https://example.com/id')).toBe('blob:https://example.com/id')
    expect(safeMediaUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
    expect(safeMediaUrl('file:///tmp/local.png')).toBeUndefined()
  })

  it('allows only Monday hosts for Monday source actions', () => {
    expect(safeMondayUrl('https://monday.com/boards/1/pulses/2')).toBe('https://monday.com/boards/1/pulses/2')
    expect(safeMondayUrl('https://adme2.monday.com/boards/1/pulses/2')).toBe('https://adme2.monday.com/boards/1/pulses/2')
    expect(safeMondayUrl('https://monday.com.evil.example/boards/1')).toBeUndefined()
    expect(safeMondayUrl('https://monday.com@evil.example/boards/1')).toBeUndefined()
    expect(safeMondayUrl('javascript:alert(1)')).toBeUndefined()
  })
})
