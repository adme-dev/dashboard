import { describe, it, expect } from 'vitest'
import { classifyQrUserAgent } from '../../server/utils/qr/ua'

describe('classifyQrUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'mobile', 'iOS', 'Safari'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36', 'mobile', 'Android', 'Chrome'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1', 'tablet', 'iOS', 'Safari'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0', 'desktop', 'Windows', 'Edge'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/121.0', 'desktop', 'macOS', 'Firefox'],
    ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'bot', 'Other', 'Other'],
  ])('%s', (ua, deviceType, os, browser) => {
    expect(classifyQrUserAgent(ua)).toEqual({ deviceType, os, browser })
  })
  it('handles null', () => {
    expect(classifyQrUserAgent(null)).toEqual({ deviceType: 'unknown', os: 'Other', browser: 'Other' })
  })
})
