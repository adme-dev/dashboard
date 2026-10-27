import { describe, expect, it } from 'vitest'
import { parseBannerRenderRequest, BANNER_RENDER_LIMITS } from '../../shared/bannerRenderContract'

const request = () => ({ version: 1, expectedEnvironment: 'production', requestId: 'test_request', output: 'png', items: [{ key: 'print', width: 2480, height: 3508, scale: 1, html: '<html></html>' }] })
describe('private banner renderer contract', () => {
  it('preserves supported print dimensions at 1x', () => expect(parseBannerRenderRequest(request()).items[0].width).toBe(2480))
  it.each([NaN, Infinity, -1, 1.2, '300'])('rejects invalid width %s', (width) => {
    const input = request()
    Object.assign(input.items[0], { width })
    expect(() => parseBannerRenderRequest(input)).toThrow()
  })
  it('rejects oversized 2x output, no silent downgrade', () => {
    const input = request()
    input.items[0].scale = 2
    expect(() => parseBannerRenderRequest(input)).toThrow('LIMIT_EXCEEDED')
  })
  it('rejects unknown authority, caller URLs, duplicate keys and oversized HTML', () => {
    expect(() => parseBannerRenderRequest({ ...request(), projectId: 'other' })).toThrow()
    expect(() => parseBannerRenderRequest({ ...request(), url: 'http://localhost' })).toThrow()
    const input = request()
    input.items.push(input.items[0])
    expect(() => parseBannerRenderRequest(input)).toThrow()
    input.items = [{ ...input.items[0], html: 'x'.repeat(BANNER_RENDER_LIMITS.MAX_HTML_BYTES + 1) }]
    expect(() => parseBannerRenderRequest(input)).toThrow('LIMIT_EXCEEDED')
  })
  it('requires JPEG quality and GIF fps; rejects cross-mode extras', () => {
    expect(() => parseBannerRenderRequest({ ...request(), output: 'jpeg' })).toThrow()
    expect(() => parseBannerRenderRequest({ ...request(), output: 'gif' })).toThrow()
    expect(() => parseBannerRenderRequest({ ...request(), fps: 10 })).toThrow()
  })
})
