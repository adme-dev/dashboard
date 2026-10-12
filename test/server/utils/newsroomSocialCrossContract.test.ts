import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { authorizeNewsroom, newsroomConfig, type NewsroomPost } from '../../../server/utils/newsroomSocialSource'
import { handleNewsroomSocial } from '../../../server/utils/newsroomSocial'

type Context = { postId: string, articleId: string, articleUpdatedAt: string, approvedBy: string, mode?: string }
type Receipt = { state: string, externalId: string, scheduledAt: string | null, url: string | null }
type Provider = {
  publish: (post: { body: string, link: string, imageUrl: null }, scheduledAt: Date | null, now: Date, context: Context) => Promise<Receipt>
  status: (externalId: string, context: Context) => Promise<{ status: string }>
  cancel: (externalId: string, context: Context) => Promise<void>
}
const mocks = vi.hoisted(() => ({ query: vi.fn(), fresh: vi.fn(), dispatch: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: (callback: (db: { query: typeof mocks.query }) => Promise<unknown>) => callback({ query: mocks.query }), queryOneFresh: mocks.fresh }))
vi.mock('~~/server/utils/socialPublishing/dispatch', () => ({ claimAndPublishSocialPost: mocks.dispatch }))

// Opt-in cross-check against the real sibling checkout, with all I/O confined to memory.
// NEWSROOM_WEBSITE_CHECKOUT=/path/to/driveagent-website vitest run ...CrossContract.test.ts
const checkout = process.env.NEWSROOM_WEBSITE_CHECKOUT
const env = { NEWSROOM_SOCIAL_ENABLED: 'true', NEWSROOM_SOCIAL_SECRET: 's'.repeat(32), NEWSROOM_SOCIAL_CLIENT_ID: '11111111-1111-4111-8111-111111111111', NEWSROOM_SOCIAL_ACCOUNT_ID: '22222222-2222-4222-8222-222222222222' }
const now = new Date('2026-10-13T00:00:00Z')
const context: Context = { postId: '33333333-3333-4333-8333-333333333333', articleId: 'article-1', articleUpdatedAt: now.toISOString(), approvedBy: 'editor@example.test' }
const post = { body: 'Reviewed newsroom copy', link: 'https://driveagent.news/news/a-story?utm_source=facebook&utm_medium=social&utm_campaign=driveagent-news-social', imageUrl: null }
let factory: (secret: string, fetchImpl: typeof fetch) => Provider
let rows: NewsroomPost[]

describe.skipIf(!checkout)('actual website adapter to XeroFlow handoff wire contract', () => {
  beforeAll(async () => {
    factory = (await import(pathToFileURL(join(checkout!, 'shared/news-social-xeroflow.ts')).href)).xeroflowFacebookProvider
  })
  beforeEach(() => {
    vi.clearAllMocks()
    rows = []
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM social_accounts')) return { rows: [{ id: env.NEWSROOM_SOCIAL_ACCOUNT_ID }] }
      if (sql.includes('FROM social_slot_schedules')) return { rows: [{ id: 'slot-1', day_of_week: 2, time_of_day: '02:00:00', timezone: 'UTC', capacity: 1, platforms: ['facebook'], metadata: { contentKind: 'news' } }] }
      if (sql.includes('INSERT INTO social_posts')) {
        const row = JSON.parse(String(params[0])) as NewsroomPost
        rows.push(row)
        return { rows: [row] }
      }
      if (sql.includes('UPDATE social_posts SET status=\'cancelled\'')) {
        rows[0].status = 'cancelled'
        rows[0].scheduled_at = null
        return { rows }
      }
      if (sql.includes('FROM social_posts')) return { rows }
      return { rows: [] }
    })
    mocks.fresh.mockImplementation(async () => rows[0])
    mocks.dispatch.mockImplementation(async () => {
      rows[0].status = 'published'
      rows[0].published_at = now.toISOString()
      rows[0].platform_results = { facebook: { status: 'success', url: 'https://www.facebook.com/123/posts/456' } }
    })
  })
  function provider() {
    const inMemoryFetch: typeof fetch = async (url, init) => {
      expect(url).toBe('https://app.xeroflow.io/api/internal/newsroom/social')
      expect(init?.redirect).toBe('error')
      const config = newsroomConfig(env)
      authorizeNewsroom(config, new Headers(init?.headers).get('x-newsroom-secret') ?? undefined)
      try {
        return Response.json(await handleNewsroomSocial(JSON.parse(String(init?.body)), config, now))
      } catch (error) {
        const status = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500
        return Response.json({ error: 'Not accepted' }, { status })
      }
    }
    return factory(env.NEWSROOM_SOCIAL_SECRET, inMemoryFetch)
  }
  it.each(['now', 'exact', 'next-slot'])('round-trips %s submit plus status through both real contracts', async (mode) => {
    const client = provider()
    const result = await client.publish(post, mode === 'exact' ? new Date('2026-10-14T03:00:00Z') : null, now, { ...context, mode })
    expect(result.state).toBe(mode === 'now' ? 'posted' : 'scheduled')
    expect((await client.status(result.externalId, context)).status).toBe(mode === 'now' ? 'published' : 'scheduled')
  })
  it('round-trips confirmed cancellation as rejected and blocks delayed resubmission', async () => {
    const client = provider()
    const result = await client.publish(post, null, now, { ...context, mode: 'next-slot' })
    await expect(client.cancel(result.externalId, context)).resolves.toBeUndefined()
    expect((await client.status(result.externalId, context)).status).toBe('rejected')
    await expect(client.publish(post, null, now, { ...context, mode: 'next-slot' })).rejects.toThrow('XeroFlow needs attention')
  })
  it('round-trips an absent status but does not confirm an absent cancellation', async () => {
    const client = provider()
    expect((await client.status(`xeroflow:${context.postId}`, context)).status).toBe('not_found')
    await expect(client.cancel(`xeroflow:${context.postId}`, context)).rejects.toThrow('XeroFlow needs attention')
  })
})
