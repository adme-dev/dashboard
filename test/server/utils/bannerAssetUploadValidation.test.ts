import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  MAX_BANNER_IMAGE_BYTES,
  MAX_BANNER_VIDEO_BYTES,
  digestBannerAssetUpload,
  validateBannerAssetUpload
} from '~~/server/utils/banner/assetUploadValidation'

const signatures = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif: Buffer.from('GIF89a'),
  webp: Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary'),
  mp4: Buffer.from('\x00\x00\x00\x18ftypisom', 'binary'),
  webm: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88])
}

function withSize(signature: Buffer, size: number): Buffer {
  const data = Buffer.alloc(size)
  signature.copy(data)
  return data
}

describe('validateBannerAssetUpload', () => {
  it('normalises and validates the supplied JPEG from magic bytes', () => {
    const data = signatures.jpeg

    expect(validateBannerAssetUpload({ filename: '../Leap Motor C10.JPG', type: 'image/jpeg', data }))
      .toMatchObject({
        fileName: 'Leap-Motor-C10.jpg',
        mimeType: 'image/jpeg',
        size: 6,
        requestDigest: '1f51c41f1436ee7699875b164fa4550450e61c21e6ca46b09b2f1b638936b9ef'
      })
  })

  it.each([
    ['PNG', signatures.png, 'image/png', 'banner.png'],
    ['GIF', signatures.gif, 'image/gif', 'banner.gif'],
    ['WebP', signatures.webp, 'image/webp', 'banner.webp'],
    ['MP4', signatures.mp4, 'video/mp4', 'banner.mp4'],
    ['WebM', signatures.webm, 'video/webm', 'banner.webm']
  ])('detects %s from its content rather than its filename', (_format, data, mimeType, fileName) => {
    expect(validateBannerAssetUpload({ filename: 'banner.not-trusted', type: mimeType, data }))
      .toMatchObject({ mimeType, fileName })
  })

  it('rejects empty files', () => {
    expect(() => validateBannerAssetUpload({ filename: 'banner.jpg', type: 'image/jpeg', data: Buffer.alloc(0) }))
      .toThrowError(/empty/i)
  })

  it('rejects images larger than 20 MiB', () => {
    expect(() => validateBannerAssetUpload({
      filename: 'banner.jpg',
      type: 'image/jpeg',
      data: withSize(signatures.jpeg, MAX_BANNER_IMAGE_BYTES + 1)
    })).toThrowError(/20 MiB/i)
  })

  it('rejects videos larger than 100 MiB', () => {
    expect(() => validateBannerAssetUpload({
      filename: 'banner.mp4',
      type: 'video/mp4',
      data: withSize(signatures.mp4, MAX_BANNER_VIDEO_BYTES + 1)
    })).toThrowError(/100 MiB/i)
  })

  it('rejects a MIME/signature mismatch', () => {
    expect(() => validateBannerAssetUpload({
      filename: 'banner.jpg', type: 'image/jpeg', data: signatures.gif
    })).toThrowError(/does not match/i)
  })

  it.each([
    ['SVG', 'banner.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['audio', 'banner.mp3', 'audio/mpeg', Buffer.from('ID3\x04\x00\x00', 'binary')],
    ['executable', 'banner.exe', 'application/octet-stream', Buffer.from([0x4d, 0x5a, 0x90, 0x00])]
  ])('rejects unsupported %s content', (_format, filename, type, data) => {
    expect(() => validateBannerAssetUpload({ filename, type, data })).toThrowError(/unsupported/i)
  })

  it('rejects control characters in filenames', () => {
    expect(() => validateBannerAssetUpload({
      filename: 'banner\u0000.jpg', type: 'image/jpeg', data: signatures.jpeg
    })).toThrowError(/filename/i)
  })

  it('requires a six-character safe basename', () => {
    expect(() => validateBannerAssetUpload({
      filename: 'car.jpg', type: 'image/jpeg', data: signatures.jpeg
    })).toThrowError(/six characters/i)
  })
})

describe('digestBannerAssetUpload', () => {
  it('creates a deterministic SHA-256 digest from canonical upload metadata', () => {
    const input = {
      fileName: 'Leap-Motor-C10.jpg',
      mimeType: 'image/jpeg' as const,
      size: 6,
      contentSha256: createHash('sha256').update(signatures.jpeg).digest('hex')
    }

    expect(digestBannerAssetUpload(input)).toBe('1f51c41f1436ee7699875b164fa4550450e61c21e6ca46b09b2f1b638936b9ef')
    expect(digestBannerAssetUpload(input)).toBe(digestBannerAssetUpload({ ...input }))
  })
})
