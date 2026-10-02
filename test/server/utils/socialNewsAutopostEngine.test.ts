import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: (fn: (connection: typeof db) => unknown) => fn(db), queryOneFresh: vi.fn(), queryRowsFresh: vi.fn(), execute: vi.fn() }))
const { fetchPublishedNews, replenishNewsRule } = await import('../../../server/utils/socialNewsAutopost')
const story = { id: 'article', title: 'A new model', content: 'A new model\n\nRead at DriveAgent News.', url: 'https://driveagent.news/news/a-new-model', mediaUrl: 'https://driveagent.news/api/news/media/article', publishedAt: '2026-10-02T05:00:00Z' }
const slot = { id: 'news', day_of_week: 5, time_of_day: '17:30', timezone: 'Australia/Melbourne', capacity: 1, platforms: ['facebook'], metadata: { contentKind: 'news' } }
let mode = 'automatic'
let existing: unknown[] = []
let imports: unknown[] = []
let inserted: Record<string, unknown>[] = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-02T06:00:00Z'))
  mode = 'automatic'
  existing = []
  imports = []
  inserted = []
  db.query.mockReset().mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith('SELECT client_id FROM social_news_autopost_rules')) return { rows: [{ client_id: 'client' }] }
    if (sql.startsWith('SELECT * FROM social_news_autopost_rules')) return { rows: [{ id: 'rule', client_id: 'client', account_id: 'account', configured_by: 'user', mode }] }
    if (sql.startsWith('SELECT id FROM social_accounts')) return { rows: [{ id: 'account' }] }
    if (sql.startsWith('SELECT * FROM social_slot_schedules')) return { rows: [slot] }
    if (sql.startsWith('SELECT id,link_url')) return { rows: existing }
    if (sql.startsWith('SELECT article_id,article_url')) return { rows: imports }
    if (sql.startsWith('INSERT INTO social_posts')) {
      inserted.push({ status: params[9], account: params[5], metadata: JSON.parse(String(params[11])) })
      return { rows: [{ id: 'post' }] }
    }
    if (sql.startsWith('INSERT INTO social_news_autopost_imports')) imports.push({ article_id: params[1], article_url: params[2] })
    return { rows: [] }
  })
})

describe('automatic replenishment', () => {
  it('schedules once and repeated polls create no additional post', async () => {
    expect((await replenishNewsRule('rule', [story])).created).toBe(1)
    expect((await replenishNewsRule('rule', [story])).created).toBe(0)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ status: 'scheduled', account: 'account', metadata: { newsAutopostAutomatic: true } })
  })
  it('recognizes a manually published tracked URL', async () => {
    existing = [{ id: 'manual', link_url: `${story.url}/?utm_source=facebook`, status: 'published', scheduled_at: null }]
    expect(await replenishNewsRule('rule', [story])).toMatchObject({ created: 0, existing: 1 })
    expect(inserted).toEqual([])
  })
  it('creates review drafts instead of approving or publishing them', async () => {
    mode = 'review'
    await replenishNewsRule('rule', [story])
    expect(inserted[0]).toMatchObject({ status: 'draft', metadata: { newsAutopostAutomatic: false } })
  })
  it('leaves manually scheduled posts in their slot', async () => {
    existing = [{ id: 'manual', link_url: null, status: 'scheduled', scheduled_at: '2026-10-02T07:30:00Z' }]
    expect((await replenishNewsRule('rule', [story])).created).toBe(0)
  })
  it('stops if the rule was paused while the feed was being fetched', async () => {
    mode = 'paused'
    expect((await replenishNewsRule('rule', [story])).created).toBe(0)
    expect(inserted).toEqual([])
  })
  it('rejects a disconnected account without writing a post', async () => {
    const original = db.query.getMockImplementation()!
    db.query.mockImplementation((sql, params) => sql.startsWith('SELECT id FROM social_accounts') ? Promise.resolve({ rows: [] }) : original(sql, params))
    await expect(replenishNewsRule('rule', [story])).rejects.toThrow('connection needs attention')
    expect(inserted).toEqual([])
  })
})

describe('owned source adapter', () => {
  it('rejects an unsuccessful or redirected feed', async () => {
    await expect(fetchPublishedNews(vi.fn().mockResolvedValue(new Response('', { status: 302 })))).rejects.toThrow('HTTP 302')
  })
  it('rejects malformed JSON contracts', async () => {
    await expect(fetchPublishedNews(vi.fn().mockResolvedValue(Response.json({ items: [] })))).rejects.toThrow('malformed')
  })
  it('limits response size', async () => {
    await expect(fetchPublishedNews(vi.fn().mockResolvedValue(new Response('x'.repeat(2_000_001))))).rejects.toThrow('response limit')
  })
  it('imports only current published stories and always fetches the fixed owned URL', async () => {
    const article = { ...story, slug: 'a-new-model', standfirst: 'The approved summary.', status: 'published', image: { url: '/api/news/media/article' } }
    const fetcher = vi.fn().mockResolvedValue(Response.json({ articles: [article, { ...article, status: 'retracted' }] }))
    expect(await fetchPublishedNews(fetcher)).toHaveLength(1)
    expect(fetcher.mock.calls[0][0]).toBe('https://driveagent.news/api/news?pageSize=50')
    expect(fetcher.mock.calls[0][1].redirect).toBe('manual')
  })
})
