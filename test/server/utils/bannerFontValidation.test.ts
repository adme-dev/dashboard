import { describe, expect, it } from 'vitest'
import { bannerFontMimeType, isBannerFontBytes } from '~~/server/utils/banner/fontValidation'

function sfnt(otf = false) {
  const bytes = Buffer.alloc(32)
  bytes.writeUInt32BE(otf ? 0x4f54544f : 0x00010000, 0)
  bytes.writeUInt16BE(1, 4)
  bytes.writeUInt32BE(28, 20)
  bytes.writeUInt32BE(4, 24)
  return bytes
}

function woff(version = 1) {
  const bytes = Buffer.alloc(64)
  bytes.write(version === 2 ? 'wOF2' : 'wOFF')
  bytes.writeUInt32BE(0x00010000, 4)
  bytes.writeUInt32BE(bytes.length, 8)
  bytes.writeUInt16BE(1, 12)
  bytes.writeUInt32BE(32, 16)
  return bytes
}

describe('banner font upload container validation', () => {
  it.each([
    ['brand.ttf', sfnt(), 'font/ttf'],
    ['brand.OTF', sfnt(true), 'font/otf'],
    ['thebrief-cff.ttf', sfnt(true), 'font/ttf'],
    ['brand.woff', woff(), 'font/woff'],
    ['brand.woff2', woff(2), 'font/woff2']
  ])('accepts matching %s container and derives its MIME', (name, bytes, mime) => {
    expect(isBannerFontBytes(bytes as Buffer, name as string)).toBe(true)
    expect(bannerFontMimeType(name as string)).toBe(mime)
  })

  it('rejects mismatched, truncated, empty and out-of-bounds containers', () => {
    expect(isBannerFontBytes(woff(), 'brand.otf')).toBe(false)
    expect(isBannerFontBytes(sfnt().subarray(0, 20), 'brand.ttf')).toBe(false)
    expect(isBannerFontBytes(Buffer.alloc(0), 'brand.ttf')).toBe(false)
    const badTable = sfnt()
    badTable.writeUInt32BE(0xffffffff, 24)
    expect(isBannerFontBytes(badTable, 'brand.ttf')).toBe(false)
    const badLength = woff()
    badLength.writeUInt32BE(1, 8)
    expect(isBannerFontBytes(badLength, 'brand.woff')).toBe(false)
    expect(isBannerFontBytes(sfnt(), 'brand.html')).toBe(false)
  })
})
