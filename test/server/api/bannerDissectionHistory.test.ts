import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), context: vi.fn(), scope: vi.fn(), access: vi.fn() }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', (event: any) => event.query || {})
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth }))
vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: async callback => callback({ query: m.query }) }))
vi.mock('~~/server/utils/banner/dissectionAccess', () => ({
  resolveDissectionContext: m.context, dissectionHistoryScope: m.scope, assertDissectionAccess: m.access,
}))
const history = (await import('../../../server/api/agency/banner-studio/dissect/history.get')).default
const userId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const source = { version: 1, width: 1200, height: 1600, mimeType: 'image/png', byteLength: 100, sha256: 'a'.repeat(64) }
beforeEach(() => {
  vi.resetAllMocks()
  m.auth.mockResolvedValue({ id: userId })
  m.scope.mockResolvedValue({ sql: 'd.user_id = $1::uuid AND current_scope = TRUE', params: [userId] })
  m.query.mockResolvedValue({ rows: [{ job_id: 'job', user_id: userId, status: 'complete', source_r2_key: 'private/original.png',
    manifest: { source, layers: [{ text: 'private findings' }], ingestion: { version: 1,
      owner: { kind: 'project', userId, projectId, projectOwnerId: userId, clientId: null },
      physical: null, ingestedAt: '2026-10-27T00:00:00.000Z', sessionsInvalidatedAt: null } } }] })
})
describe('history fresh scoping and safe projection', () => {
  it('applies the fresh SQL predicate before pagination and projects only allowed fields', async () => {
    const result = await history({ query: { projectId } } as never)
    const [sql, params] = m.query.mock.calls[0]
    expect(sql.indexOf('current_scope = TRUE')).toBeLessThan(sql.indexOf('LIMIT 50'))
    expect(params).toEqual([userId])
    expect(m.access).toHaveBeenCalledWith(expect.anything(), userId, expect.anything(), 'read')
    expect(result.dissections[0]).toMatchObject({ jobId: 'job', source: { width: 1200 }, ingestion: { ownerKind: 'project', projectId } })
    expect(JSON.stringify(result)).not.toMatch(/source_r2_key|private\/|private findings|sessionsInvalidatedAt|projectOwnerId|userId/)
  })
  it('denies a revoked context before selecting job data', async () => {
    m.context.mockRejectedValue({ statusCode: 403 })
    await expect(history({ query: { projectId } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('fails the response if access or complete metadata validation fails after selection', async () => {
    m.access.mockRejectedValue({ statusCode: 403 })
    await expect(history({ query: { projectId } } as never)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('keeps unsaved personal context separate from scoped histories', async () => {
    await history({} as never)
    expect(m.query.mock.calls[0][0]).toContain("->>'kind' = 'user'")
  })
  it.each([{ projectId: 'invalid' }, { sourceR2Key: 'private' }, { projectId: [projectId, projectId] }])('rejects malformed context before DB reads', async query => {
    await expect(history({ query } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query).not.toHaveBeenCalled()
  })
})
