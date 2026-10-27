import { describe, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { validateArtworkPng } from '../../../server/utils/banner/artworkValidation'

function fixture() {
  const png = new PNG({ width: 2, height: 2 })
  png.data.fill(255)
  png.data[3] = 0
  return PNG.sync.write(png)
}

describe('artwork PNG pre-decode bounds', () => {
  it.each([24, 25, 26, 27, 28])('rejects unsupported IHDR byte %i before decoding', (offset) => {
    const bytes = fixture()
    bytes[offset] = offset === 24 ? 16 : offset === 25 ? 7 : 1
    const read = vi.spyOn(PNG.sync, 'read')
    try {
      expect(() => validateArtworkPng(bytes, false)).toThrow()
      expect(read).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it('rejects a second IHDR before it can replace the checked dimensions or encoding', () => {
    const bytes = fixture()
    const header = Buffer.from(bytes.subarray(8, 33))
    header[20] = 1
    const duplicate = Buffer.concat([bytes.subarray(0, 33), header, bytes.subarray(33)])
    const read = vi.spyOn(PNG.sync, 'read')
    try {
      expect(() => validateArtworkPng(duplicate, false)).toThrow()
      expect(read).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it('retains normal noninterlaced RGBA and transparency', () => {
    expect(validateArtworkPng(fixture(), true)).toMatchObject({ width: 2, height: 2, hasTransparency: true })
  })
})
