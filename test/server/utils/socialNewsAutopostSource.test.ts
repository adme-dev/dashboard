import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAutomaticNewsSource } from '../../../server/utils/socialNewsAutopostSource'

const post = { link_url: 'https://driveagent.news/news/a-story', metadata: { newsAutopostAutomatic: true, articleId: 'article' } }
const story = { id: 'article', slug: 'a-story', title: 'Story headline', publishedAt: '2026-10-02T05:00:00Z', status: 'published', image: { url: '/api/news/media/article' } }
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T06:00:00Z'))
})
afterEach(() => vi.useRealTimers())
describe('dispatch source check', () => {
  it('checks the same article is still published', async () => {
    expect(await verifyAutomaticNewsSource(post, vi.fn().mockResolvedValue(Response.json(story)))).toBe('ready')
  })
  it('cancels confirmed withdrawn, missing, changed-identity or expired stories', async () => {
    for (const response of [new Response('', { status: 410 }), Response.json({ ...story, status: 'retracted' }), Response.json({ ...story, id: 'different' }), Response.json({ ...story, publishedAt: '2026-09-20T00:00:00Z' })]) {
      expect(await verifyAutomaticNewsSource(post, vi.fn().mockResolvedValue(response))).toBe('withdrawn')
    }
  })
  it('retries temporary source failures without contacting Facebook', async () => {
    expect(await verifyAutomaticNewsSource(post, vi.fn().mockResolvedValue(new Response('', { status: 503 })))).toBe('retry')
    expect(await verifyAutomaticNewsSource(post, vi.fn().mockRejectedValue(new Error('timeout')))).toBe('retry')
  })
  it('retries a parseable response with an invalid source contract', async () => {
    expect(await verifyAutomaticNewsSource(post, vi.fn().mockResolvedValue(Response.json({})))).toBe('retry')
    expect(await verifyAutomaticNewsSource(post, vi.fn().mockResolvedValue(Response.json({ error: 'temporarily unavailable' })))).toBe('retry')
  })
  it('does not fetch for manually approved posts', async () => {
    const fetcher = vi.fn()
    expect(await verifyAutomaticNewsSource({ link_url: null }, fetcher)).toBe('ready')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
