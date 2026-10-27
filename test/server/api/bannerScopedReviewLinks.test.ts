import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ fresh: vi.fn(), query: vi.fn(), rows: vi.fn(), effect: vi.fn(), storage: vi.fn(), tx: vi.fn(), db: vi.fn() }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', () => 'opaque-id')
vi.stubGlobal('readBody', (event: any) => event.body)
vi.stubGlobal('setHeader', vi.fn())
vi.mock('~~/server/utils/db', () => ({ queryOne: m.query, queryOneFresh: m.fresh, queryRows: m.rows, execute: m.effect, transactionWithoutRetry: m.tx }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: '11111111-1111-4111-8111-111111111111' }), requireWriteAccess: async () => ({ id: '11111111-1111-4111-8111-111111111111' }) }))
vi.mock('~~/server/utils/bannerStorage', () => ({ deleteBannerFile: m.storage }))
const mint = (await import('../../../server/api/agency/banner-studio/links/index.post')).default
const review = (await import('../../../server/api/public/banner-review/[token].get')).default
const remove = (await import('../../../server/api/agency/banner-studio/exports/[id].delete')).default
const projectId = '22222222-2222-4222-8222-222222222222'
const canvas = { square: { dissectionSource: { jobId: '33333333-3333-4333-8333-333333333333', sourceSha256: 'a'.repeat(64) }, layers: [{ text: 'Confidential copy' }] } }
beforeEach(() => {
  vi.clearAllMocks()
  const read = async (sql: string) => {
    if (sql.includes('FROM banner_review_links')) return { id: 'link', projectId, revoked: false, expiresAt: '2099-01-01' }
    if (sql.includes('FROM banner_exports')) return { id: 'export', r2_key: `scoped-banner-exports/${projectId}/output.png` }
    return { id: projectId, canvas_data: canvas, canvasData: canvas }
  }
  m.fresh.mockImplementation(read); m.query.mockImplementation(read); m.rows.mockResolvedValue([])
  m.db.mockResolvedValue({ rows: [] }); m.tx.mockImplementation((fn: any) => fn({ query: m.db }))
})
describe('public review and export deletion exclusion', () => {
  it('rejects protected review link mint before any durable token insert', async () => {
    await expect(mint({ body: { projectId } } as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toEqual([])
    expect(m.db.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toEqual([])
  })
  it('requires fresh active authority even for unprotected link mint', async () => {
    m.fresh.mockResolvedValue({ canvas_data: {} })
    await expect(mint({ body: { projectId } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toEqual([])
    expect(m.db.mock.calls.filter(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toEqual([])
  })
  it('rejects a preexisting public token before canvas or comments disclosure', async () => {
    await expect(review({} as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.rows).not.toHaveBeenCalled()
  })
  it('preserves legacy public review', async () => {
    const read = async (sql: string) => sql.includes('FROM banner_review_links')
      ? { id: 'link', projectId, revoked: false, expiresAt: '2099-01-01' } : { id: projectId, canvasData: { square: { layers: [] } } }
    m.fresh.mockImplementation(read); m.query.mockImplementation(read)
    await expect(review({} as any)).resolves.toMatchObject({ linkId: 'link', comments: [] })
  })
  it('rejects protected export deletion before object or row deletion', async () => {
    await expect(remove({} as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.storage).not.toHaveBeenCalled(); expect(m.effect).not.toHaveBeenCalled()
  })
})
