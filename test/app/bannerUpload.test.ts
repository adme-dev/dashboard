// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { nextBannerUploadKey, prepareBannerUploadRequest } from '~~/app/utils/bannerUpload'

describe('banner upload browser identity', () => {
  it('hashes the canonical validated upload identity and sends stable headers', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00])
    const file = new File([jpegBytes], 'Leap Motor.jpg', { type: 'image/jpeg' })

    const request = await prepareBannerUploadRequest(file, 'banner-upload:fixed-key')

    expect(request.headers['Idempotency-Key']).toBe('banner-upload:fixed-key')
    expect(request.headers['X-Banner-Upload-Digest']).toBe('1307bf4656c0f9129952749e619ce5f7640ec31b324f38ecb94a1ec63197d7e1')
    expect(request.body.get('file')).toBe(file)
  })

  it('generates a fresh namespaced key for each selected upload', () => {
    const first = nextBannerUploadKey()
    const second = nextBannerUploadKey()

    expect(first).toMatch(/^banner-upload:[0-9a-f-]{36}$/)
    expect(second).toMatch(/^banner-upload:[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
  })
})
