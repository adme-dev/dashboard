import { describe, it, expect } from 'vitest'
import { normalizeMastodonResults } from '~~/server/utils/socialListening/sources/mastodon'

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
