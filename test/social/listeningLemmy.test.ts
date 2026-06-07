import { describe, it, expect, vi } from 'vitest'
import { normalizeLemmyResults, lemmySource } from '~~/server/utils/socialListening/sources/lemmy'

const PAYLOAD = {
  posts: [
    {
      post: { id: 991, ap_id: 'https://lemmy.world/post/991', name: 'Acme is shipping', body: 'great release', published: '2026-06-01T09:00:00' },
      creator: { name: 'jane' },
      community: { name: 'technology' },
    },
    { post: { id: 992, ap_id: 'https://lemmy.world/post/992', name: 'No body post', body: null, published: '2026-06-01T10:00:00' }, creator: { name: 'bob' } },
  ],
}

describe('normalizeLemmyResults', () => {
  it('maps post_view[] to RawMentions using the federated ap_id as url', () => {
    const out = normalizeLemmyResults(PAYLOAD, 'https://lemmy.world')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      source: 'lemmy', externalId: 'lemmy:991', url: 'https://lemmy.world/post/991',
      author: 'jane', title: 'Acme is shipping', content: 'great release', publishedAt: '2026-06-01T09:00:00',
    })
    expect(out[0].raw).toMatchObject({ instance: 'https://lemmy.world', community: 'technology' })
  })
  it('skips posts with no id and returns [] for malformed payloads', () => {
    expect(normalizeLemmyResults({ posts: [{ post: { name: 'no id' } }] }, 'x')).toEqual([])
    expect(normalizeLemmyResults(null, 'x')).toEqual([])
    expect(normalizeLemmyResults({}, 'x')).toEqual([])
  })
})

describe('lemmySource', () => {
  it('is gated on SOCIAL_LISTENING_LEMMY_INSTANCES', () => {
    expect(lemmySource.isEnabled({})).toBe(false)
    expect(lemmySource.isEnabled({ SOCIAL_LISTENING_LEMMY_INSTANCES: 'https://lemmy.world' })).toBe(true)
  })
  it('searches each configured instance and SSRF-blocks private hosts', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })) as unknown as typeof fetch
    const env = { SOCIAL_LISTENING_LEMMY_INSTANCES: 'https://lemmy.world, http://127.0.0.1' }
    const out = await lemmySource.search({ terms: ['acme'], limit: 25, fetchImpl, env })
    // only the public instance is fetched (loopback is dropped); each returns 2 posts
    expect((fetchImpl as any).mock.calls).toHaveLength(1)
    expect((fetchImpl as any).mock.calls[0][0]).toContain('lemmy.world/api/v3/search')
    expect(out).toHaveLength(2)
  })
  it('returns [] on empty terms', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })) as unknown as typeof fetch
    expect(await lemmySource.search({ terms: [], limit: 25, fetchImpl, env: { SOCIAL_LISTENING_LEMMY_INSTANCES: 'https://lemmy.world' } })).toEqual([])
  })
})
