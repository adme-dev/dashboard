import { describe, it, expect } from 'vitest'
import { isValidPushEndpoint } from '../../../server/utils/pushSubscriptionValidation'

describe('isValidPushEndpoint', () => {
  describe('accepts known push service hosts', () => {
    const valid = [
      'https://fcm.googleapis.com/fcm/send/abc123',
      'https://android.googleapis.com/gcm/send/xyz',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QABCD',
      'https://api.push.apple.com/3/device/token',
      'https://api.development.push.apple.com/3/device/token',
      'https://db5.notify.windows.com/?token=abc',
    ]
    it.each(valid)('%s', (endpoint) => {
      expect(isValidPushEndpoint(endpoint)).toBe(true)
    })
  })

  describe('rejects non-https schemes', () => {
    const httpVariants = [
      'http://fcm.googleapis.com/fcm/send/abc',  // plain http, otherwise valid host
      'ftp://fcm.googleapis.com/fcm/send/abc',
      'file:///etc/passwd',
      'javascript:alert(1)',
    ]
    it.each(httpVariants)('%s', (endpoint) => {
      expect(isValidPushEndpoint(endpoint)).toBe(false)
    })
  })

  describe('rejects SSRF-flavoured targets', () => {
    const malicious = [
      'https://169.254.169.254/latest/meta-data',     // AWS metadata
      'https://metadata.google.internal/',             // GCP metadata
      'https://localhost:5432/',
      'https://127.0.0.1/',
      'https://[::1]/',
      'https://10.0.0.1/internal',
      'https://attacker.com/fcm.googleapis.com',       // path-only match attempt
      'https://fcm.googleapis.com.attacker.com/send',  // suffix-spoofing
    ]
    it.each(malicious)('%s', (endpoint) => {
      expect(isValidPushEndpoint(endpoint)).toBe(false)
    })
  })

  describe('rejects malformed input', () => {
    it('empty string', () => {
      expect(isValidPushEndpoint('')).toBe(false)
    })
    it('non-URL string', () => {
      expect(isValidPushEndpoint('not a url')).toBe(false)
    })
    it('null / undefined', () => {
      expect(isValidPushEndpoint(null)).toBe(false)
      expect(isValidPushEndpoint(undefined)).toBe(false)
    })
    it('non-string types', () => {
      expect(isValidPushEndpoint(42)).toBe(false)
      expect(isValidPushEndpoint({})).toBe(false)
    })
  })

  describe('case insensitivity', () => {
    it('uppercase hostname accepted', () => {
      expect(isValidPushEndpoint('https://FCM.GOOGLEAPIS.COM/fcm/send/abc')).toBe(true)
    })
  })
})
