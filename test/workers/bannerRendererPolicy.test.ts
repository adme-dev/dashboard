import { describe, expect, it } from 'vitest'
import { resourceAllowed, parseResourceManifest, PINNED_FONT_PATH, GSAP_URLS } from '../../workers/banner-renderer/src/resourcePolicy'

const manifest = { appOrigins: ['https://app.xeroflow.io'], assetOrigins: ['https://assets.xeroflow.io'] }
const allowed = (url: string, type = 'image', redirect = false) => resourceAllowed(url, type, 'GET', redirect, true, manifest)
describe('renderer resource confinement', () => {
  it.each(['http://127.0.0.1/a', 'https://127.1/a', 'https://[::1]/a', 'https://localhost/a', 'https://x.internal/a', 'https://other.example/a', 'https://app.xeroflow.io/api/admin', 'https://assets.xeroflow.io:444/a', 'https://user@assets.xeroflow.io/a'])('blocks %s', url => expect(allowed(url)).toBe(false))
  it('permits only signed asset paths and exact font on app host', () => {
    expect(allowed('https://app.xeroflow.io/api/public/banner-assets/v1.' + 'a'.repeat(48) + '.' + 'a'.repeat(43))).toBe(true)
    expect(allowed('https://app.xeroflow.io' + PINNED_FONT_PATH, 'font')).toBe(true)
    expect(allowed('https://app.xeroflow.io' + PINNED_FONT_PATH + '?extra=1', 'font')).toBe(false)
  })
  it('blocks redirects and script execution on asset hosts', () => {
    expect(allowed('https://assets.xeroflow.io/a.png', 'image', true)).toBe(false)
    expect(allowed('https://assets.xeroflow.io/a.js', 'script')).toBe(false)
    expect(allowed(GSAP_URLS[0], 'script')).toBe(true)
    expect(allowed(GSAP_URLS[0] + '?x', 'script')).toBe(false)
  })
  it('rejects malformed deployment manifests', () => {
    expect(() => parseResourceManifest('["https://127.0.0.1"]', '[]')).toThrow('UNAVAILABLE')
    expect(() => parseResourceManifest('["https://app.xeroflow.io/path"]', '[]')).toThrow('UNAVAILABLE')
  })
})
