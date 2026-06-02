import { describe, it, expect } from 'vitest'
import { normalizeMastodonResults, isSafeInstanceUrl } from '~~/server/utils/socialListening/sources/mastodon'

describe('isSafeInstanceUrl (SSRF guard)', () => {
  it('allows public https/http instances', () => {
    expect(isSafeInstanceUrl('https://mastodon.social')).toBe(true)
    expect(isSafeInstanceUrl('http://mas.to')).toBe(true)
  })
  it('blocks loopback, private, link-local and metadata hosts', () => {
    for (const bad of [
      'http://localhost', 'http://127.0.0.1', 'http://10.0.0.5', 'http://192.168.1.1',
      'http://172.16.0.1', 'http://169.254.169.254', 'http://0.0.0.0', 'http://[::1]',
    ]) expect(isSafeInstanceUrl(bad)).toBe(false)
  })
  it('blocks non-http protocols and garbage', () => {
    expect(isSafeInstanceUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeInstanceUrl('not a url')).toBe(false)
  })
})

describe('normalizeMastodonResults', () => {
  const payload = { statuses: [
    { id: '111', url: 'https://mas.to/@jane/111', account: { acct: 'jane@mas.to' },
      content: '<p>love acme</p>', created_at: '2026-06-01T00:00:00Z', language: 'en' },
  ] }
  it('maps statuses to RawMentions, stripping HTML from content', () => {
    const out = normalizeMastodonResults(payload, 'https://mas.to')
    expect(out[0]).toMatchObject({ source: 'mastodon', externalId: 'https://mas.to/@jane/111', author: 'jane@mas.to', content: 'love acme', lang: 'en' })
    expect(out[0].url).toBe('https://mas.to/@jane/111')
  })
  it('returns [] for malformed payloads', () => { expect(normalizeMastodonResults(null, 'x')).toEqual([]) })
})
