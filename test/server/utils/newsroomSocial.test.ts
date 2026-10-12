import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizeNewsroom, newsroomConfig, signNewsroomPost, verifyNewsroomSource, type NewsroomPost } from '../../../server/utils/newsroomSocialSource'
import { handleNewsroomSocial, parseNewsroomRequest } from '../../../server/utils/newsroomSocial'

const db = vi.hoisted(() => ({ query: vi.fn(), fresh: vi.fn(), dispatch: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: (fn: (tx: { query: typeof db.query }) => Promise<unknown>) => fn({ query: db.query }), queryOneFresh: (...args: unknown[]) => db.fresh(...args) }))
vi.mock('~~/server/utils/socialPublishing/dispatch', () => ({ claimAndPublishSocialPost: (...args: unknown[]) => db.dispatch(...args) }))
const env = { NEWSROOM_SOCIAL_ENABLED: 'true', NEWSROOM_SOCIAL_SECRET: 's'.repeat(32), NEWSROOM_SOCIAL_CLIENT_ID: '11111111-1111-4111-8111-111111111111', NEWSROOM_SOCIAL_ACCOUNT_ID: '22222222-2222-4222-8222-222222222222' }
const config = () => newsroomConfig(env)
const input = { action: 'submit', postId: 'local-1', articleId: 'article-1', articleUpdatedAt: '2026-10-13T01:00:00Z', body: 'Approved words', link: 'https://driveagent.news/news/a-story', imageUrl: 'https://driveagent.news/api/news/media/image-1', mode: 'next-slot', approvedBy: 'editor-1' }
const now = new Date('2026-10-13T00:00:00Z')
function post() {
  return { id: 'remote-1', client_id: env.NEWSROOM_SOCIAL_CLIENT_ID, created_by: 'driveagent-newsroom', content: input.body, link_url: input.link, media_urls: [input.imageUrl], platforms: ['facebook'], account_ids: [env.NEWSROOM_SOCIAL_ACCOUNT_ID], publish_targets: [{ platform: 'facebook', accountId: env.NEWSROOM_SOCIAL_ACCOUNT_ID }], platform_overrides: {}, first_comment: null, scheduled_at: '2026-10-13T02:00:00.000Z', status: 'scheduled', metadata: { source: 'driveagent-newsroom', newsroomPostId: input.postId, articleId: input.articleId, articleUpdatedAt: input.articleUpdatedAt, mode: input.mode } }
}
const slot = { id: 'slot-1', day_of_week: 2, time_of_day: '02:00:00', timezone: 'UTC', capacity: 1, platforms: ['facebook'], metadata: { contentKind: 'news' } }
function mockStore(existing: NewsroomPost[] = [], occupied: Array<{ scheduled_at: string }> = []) {
  db.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM social_accounts')) return { rows: [{ id: env.NEWSROOM_SOCIAL_ACCOUNT_ID }] }
    if (sql.includes('FROM social_slot_schedules')) return { rows: [slot] }
    if (sql.includes('FROM social_posts') && sql.includes('scheduled_at >')) return { rows: occupied }
    if (sql.includes('FROM social_posts')) return { rows: existing }
    if (sql.includes('INSERT INTO social_posts')) {
      const created = JSON.parse(String(params[0]))
      existing.push(created)
      return { rows: [created] }
    }
    if (sql.includes('UPDATE social_posts') && sql.includes('newsroomHandoffArticleId')) {
      existing[0].metadata = { ...existing[0].metadata, newsroomHandoffArticleId: params[2], newsroomHandoffPostId: params[3] }
      return { rows: existing }
    }
    return { rows: [] }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStore()
  db.dispatch.mockResolvedValue({ ok: true })
  db.fresh.mockResolvedValue(null)
})
describe('newsroom machine boundary', () => {
  it('requires enabled binding configuration and constant-time secret authorization', () => {
    expect(() => newsroomConfig({ ...env, NEWSROOM_SOCIAL_ENABLED: 'false' })).toThrow()
    expect(() => authorizeNewsroom(config(), 'wrong')).toThrow()
    expect(() => authorizeNewsroom(config(), env.NEWSROOM_SOCIAL_SECRET)).not.toThrow()
  })
  it.each([{ mode: 'someday' }, { link: 'https://evil.test/news/foo' }, { imageUrl: 'http://127.0.0.1/x' }, { mode: 'exact' }, { articleUpdatedAt: 'not-date' }])('rejects malformed or arbitrary destinations %j', (patch) => {
    expect(() => parseNewsroomRequest({ ...input, ...patch })).toThrow()
  })
  it('accepts the website wire payload with null schedule and image for next-slot', () => {
    expect(parseNewsroomRequest({ ...input, imageUrl: null, scheduledAt: null })).toMatchObject({ mode: 'next-slot', scheduledAt: null })
  })
  it('returns explicit not_found for reconciliation before first handoff', async () => {
    expect(await handleNewsroomSocial({ action: 'status', postId: input.postId, articleId: input.articleId }, config(), now)).toEqual({ id: null, status: 'not_found', scheduledAt: null, publishedAt: null, url: null, error: null })
  })
  it('reserves next free saved slot beyond occupied capacity, without publishing', async () => {
    mockStore([], [{ scheduled_at: '2026-10-13T02:00:00Z' }])
    const result = await handleNewsroomSocial(input, config(), now)
    expect(result.status).toBe('scheduled')
    expect(result.scheduledAt).toBe('2026-10-20T02:00:00.000Z')
    expect(db.dispatch).not.toHaveBeenCalled()
    expect(db.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock')
  })
  it('reconciles repeated handoff with same identity without another insert', async () => {
    const first = await handleNewsroomSocial(input, config(), now)
    const second = await handleNewsroomSocial(input, config(), now)
    expect(first.id).toBe(second.id)
    expect(db.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO social_posts'))).toHaveLength(1)
  })
  it('rejects conflicting approved copy for an existing pending handoff', async () => {
    await handleNewsroomSocial(input, config(), now)
    await expect(handleNewsroomSocial({ ...input, body: 'Changed words' }, config(), now)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('rejects legacy editable draft canonical-link duplicates', async () => {
    mockStore([{ ...post(), created_by: 'legacy', metadata: {}, status: 'draft', link_url: `${input.link}/?utm_source=old` }])
    await expect(handleNewsroomSocial(input, config(), now)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.dispatch).not.toHaveBeenCalled()
  })
  it('returns legacy published result without approving another post', async () => {
    mockStore([{ ...post(), created_by: 'legacy', metadata: {}, status: 'published', published_at: now.toISOString(), platform_results: { facebook: { status: 'success', url: 'https://facebook.com/123' } } }])
    expect(await handleNewsroomSocial(input, config(), now)).toMatchObject({ status: 'published', url: 'https://facebook.com/123' })
    expect(db.dispatch).not.toHaveBeenCalled()
  })
  it('persists stable aliases when adopting a published legacy link for future status reads', async () => {
    const rows = [{ ...post(), created_by: 'legacy', metadata: {}, status: 'published' }]
    mockStore(rows)
    await handleNewsroomSocial(input, config(), now)
    expect(rows[0].metadata).toMatchObject({ newsroomHandoffArticleId: input.articleId, newsroomHandoffPostId: input.postId })
  })
  it('does not report another platform success as Facebook publication', async () => {
    mockStore([{ ...post(), created_by: 'legacy', metadata: {}, status: 'partially_published', platform_results: { linkedin: { status: 'success' }, facebook: { status: 'failed' } } }])
    await expect(handleNewsroomSocial(input, config(), now)).rejects.toMatchObject({ statusCode: 409 })
  })
  it.each([{}, { body: 'Newly approved copy' }, { postId: 'new-local-id' }])('never resurrects a cancelled article identity for a delayed or changed submit %j', async (patch) => {
    mockStore([{ ...post(), status: 'cancelled' }])
    await expect(handleNewsroomSocial({ ...input, ...patch }, config(), now)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false)
  })
  it('normalizes confirmed cancelled handoff status to rejected', async () => {
    mockStore([{ ...post(), status: 'cancelled', scheduled_at: null }])
    expect(await handleNewsroomSocial({ action: 'status', postId: input.postId, articleId: input.articleId }, config(), now)).toMatchObject({ status: 'rejected', scheduledAt: null })
  })
  it('refuses to confirm cancellation before any handoff exists', async () => {
    await expect(handleNewsroomSocial({ action: 'cancel', postId: input.postId, articleId: input.articleId }, config(), now)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('refuses cancellation after an attempted failed provider send with uncertain outcome', async () => {
    mockStore([{ ...post(), status: 'failed', publish_attempts: 1 }])
    await expect(handleNewsroomSocial({ action: 'cancel', postId: input.postId, articleId: input.articleId }, config(), now)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE social_posts'))).toBe(false)
  })
  it('keeps now submissions scheduled for cron recovery if the immediate process crashes', async () => {
    const rows: NewsroomPost[] = []
    mockStore(rows)
    db.dispatch.mockRejectedValue(new Error('process interrupted'))
    await expect(handleNewsroomSocial({ ...input, mode: 'now' }, config(), now)).rejects.toThrow()
    expect(rows[0]).toMatchObject({ status: 'scheduled', scheduled_at: now.toISOString() })
  })
  it('passes an ISO claim time when PostgreSQL returns a Date timestamp', async () => {
    const originalQuery = db.query.getMockImplementation()!
    db.query.mockImplementation(async (sql: string, params: unknown[]) => {
      const result = await originalQuery(sql, params)
      if (sql.includes('INSERT INTO social_posts')) result.rows[0].scheduled_at = new Date(result.rows[0].scheduled_at)
      return result
    })
    db.fresh.mockResolvedValue({ ...post(), status: 'published' })
    await handleNewsroomSocial({ ...input, mode: 'now' }, config(), now)
    expect(db.dispatch).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: now.toISOString() }))
  })
  it('never cancels a live or already claimed post', async () => {
    mockStore([{ ...post(), status: 'publishing' }])
    await expect(handleNewsroomSocial({ action: 'cancel', postId: input.postId, articleId: input.articleId }, config(), now)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('DELETE'))).toBe(false)
  })
  it('leaves an uncertain immediate dispatch identifiable and does not dispatch again on retry', async () => {
    const rows: NewsroomPost[] = []
    mockStore(rows)
    db.dispatch.mockImplementation(async () => {
      rows[0].status = 'publishing'
      throw new Error('response lost')
    })
    await expect(handleNewsroomSocial({ ...input, mode: 'now' }, config(), now)).rejects.toThrow('response lost')
    const result = await handleNewsroomSocial({ ...input, mode: 'now' }, config(), now)
    expect(result.status).toBe('publishing')
    expect(db.dispatch).toHaveBeenCalledTimes(1)
  })
})
describe('newsroom dispatch preflight', () => {
  it('checks fixed public endpoint without redirecting and accepts matching revision', async () => {
    const row: NewsroomPost = post()
    row.metadata!.signature = signNewsroomPost(row, config().secret)
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: input.articleId, status: 'published', slug: 'a-story', updatedAt: input.articleUpdatedAt })))
    expect(await verifyNewsroomSource(row, config(), fetcher)).toBe('ready')
    expect(fetcher).toHaveBeenCalledWith('https://driveagent.news/api/news/articles/a-story', expect.objectContaining({ redirect: 'error' }))
  })
  it.each([{ status: 'retracted' }, { updatedAt: '2026-10-14T01:00:00Z' }, { id: 'other' }])('blocks changed or withdrawn source %j', async (patch) => {
    const row: NewsroomPost = post()
    row.metadata!.signature = signNewsroomPost(row, config().secret)
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: input.articleId, status: 'published', slug: 'a-story', updatedAt: input.articleUpdatedAt, ...patch })))
    expect(await verifyNewsroomSource(row, config(), fetcher)).toBe('blocked')
  })
  it.each(['content', 'metadata', 'account_ids', 'platform_overrides'])('blocks dashboard tampering of %s before any fetch', async (field) => {
    const row: NewsroomPost = post()
    row.metadata!.signature = signNewsroomPost(row, config().secret)
    row[field] = field === 'content' ? 'Modified' : field === 'metadata' ? {} : field === 'account_ids' ? ['other'] : { facebook: { content: 'Modified' } }
    const fetcher = vi.fn()
    expect(await verifyNewsroomSource(row, config(), fetcher)).toBe('blocked')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('blocks Supercars content without current explicit distribution permission', async () => {
    const row: NewsroomPost = post()
    row.metadata!.signature = signNewsroomPost(row, config().secret)
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: input.articleId, status: 'published', slug: 'a-story', updatedAt: input.articleUpdatedAt, category: 'Supercars' })))
    expect(await verifyNewsroomSource(row, config(), fetcher)).toBe('blocked')
  })
  it('fails closed on source network failure', async () => {
    const row: NewsroomPost = post()
    row.metadata!.signature = signNewsroomPost(row, config().secret)
    expect(await verifyNewsroomSource(row, config(), vi.fn().mockRejectedValue(new Error('timeout')))).toBe('blocked')
  })
})
