import { deflateSync, inflateSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { packSfntAsWoff } from '../../scripts/thebrief/woff-font.mjs'

// Well-formed synthetic SFNT with a checksum-adjusted head and a large table.
function fixture() {
  const font = Buffer.alloc(44 + 12 + 4096)
  font.writeUInt32BE(0x00010000, 0)
  font.writeUInt16BE(2, 4)
  font.writeUInt16BE(32, 6)
  font.writeUInt16BE(1, 8)
  font.write('head', 12)
  font.writeUInt32BE(44, 20)
  font.writeUInt32BE(12, 24)
  font.write('test', 28)
  font.writeUInt32BE(56, 36)
  font.writeUInt32BE(4096, 40)
  let sum = 0
  for (let offset = 0; offset < font.length; offset += 4) sum = (sum + font.readUInt32BE(offset)) >>> 0
  font.writeUInt32BE((0xb1b0afba - sum) >>> 0, 52)
  return font
}

it('compresses every table without changing font bytes, glyph coverage or checksum adjustment', () => {
  const font = fixture()
  const woff = packSfntAsWoff(font)
  expect(woff.length).toBeLessThan(font.length)
  expect(woff.readUInt32BE(0)).toBe(0x774f4646)
  expect(woff.readUInt32BE(8)).toBe(woff.length)
  expect(woff.readUInt32BE(16)).toBe(font.length)
  for (let index = 0; index < 2; index++) {
    const entry = 44 + index * 20
    const offset = woff.readUInt32BE(entry + 4)
    const compressedLength = woff.readUInt32BE(entry + 8)
    const originalLength = woff.readUInt32BE(entry + 12)
    const bytes = woff.subarray(offset, offset + compressedLength)
    const restored = compressedLength === originalLength ? bytes : inflateSync(bytes)
    expect(restored).toEqual(font.subarray(font.readUInt32BE(20 + index * 16), font.readUInt32BE(20 + index * 16) + originalLength))
    expect(woff.readUInt32BE(entry + 16)).toBe(font.readUInt32BE(16 + index * 16))
    expect(offset % 4).toBe(0)
  }
  expect(deflateSync(font).length).toBeLessThan(font.length)
})

it.each(['flavor', 'offset', 'checksum', 'duplicate', 'trailing', 'header'])('rejects malformed %s without changing input', (failure) => {
  let font = fixture()
  if (failure === 'flavor') font.write('ttcf', 0)
  if (failure === 'offset') font.writeUInt32BE(40, 36)
  if (failure === 'checksum') font[80] = 1
  if (failure === 'duplicate') font.write('head', 28)
  if (failure === 'trailing') font = Buffer.concat([font, Buffer.alloc(4)])
  if (failure === 'header') font.writeUInt16BE(0, 6)
  const before = Buffer.from(font)
  expect(() => packSfntAsWoff(font)).toThrow()
  expect(font).toEqual(before)
})
