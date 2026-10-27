import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ write: vi.fn(), query: vi.fn(), fresh: vi.fn(), access: vi.fn(), all: vi.fn() }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', () => 'project')
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.write, requireWriteAccess: m.write }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.query, queryOneFresh: m.fresh }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ hasAllSocialClientAccess: m.all, requireSocialClientAccess: m.access }))
const update = (await import('../../../server/api/agency/banner-studio/projects/[id].patch')).default

beforeEach(() => {
  vi.resetAllMocks()
  m.write.mockResolvedValue({ id: 'owner' })
  m.fresh.mockResolvedValue({ clientId: null, createdBy: 'owner' })
  m.query.mockImplementation(async (sql: string) => sql.includes('UPDATE banner_projects') ? { id: 'project' } : null)
})
describe('Banner project write scope for artwork and recipes', () => {
  it('blocks another user unassigned project before snapshots or writes', async () => {
    m.fresh.mockResolvedValue({ clientId: null, createdBy: 'other' })
    await expect(update({ body: { canvasData: {} } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('requires existing client access before changing a project', async () => {
    m.fresh.mockResolvedValue({ clientId: 'client-a', createdBy: 'owner' })
    m.access.mockRejectedValue({ statusCode: 403 })
    await expect(update({ body: { name: 'New name' } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('requires destination access before moving saved client artwork', async () => {
    m.access.mockRejectedValue({ statusCode: 403 })
    await expect(update({ body: { clientId: '11111111-1111-4111-8111-111111111111' } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('allows an owned project save and returns the persisted result', async () => {
    expect(await update({ body: { name: 'Saved artwork' } } as never)).toEqual({ id: 'project' })
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE banner_projects'), ['Saved artwork', 'project'])
  })
  it('rejects a stale saved revision before snapshots or writes', async () => {
    m.fresh.mockResolvedValue({ clientId: null, createdBy: 'owner', updatedAt: '2026-10-26T01:00:00.000Z' })
    await expect(update({ body: { canvasData: {}, expectedRevision: '2026-10-26T00:00:00.000Z' } } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query).not.toHaveBeenCalled()
  })
  it('rejects a concurrent write occurring after access/revision checks', async () => {
    const expectedRevision = '2026-10-26T01:00:00.000Z'
    m.fresh.mockResolvedValue({ clientId: null, createdBy: 'owner', updatedAt: expectedRevision })
    m.query.mockResolvedValue(null)
    await expect(update({ body: { name: 'AI replacement', expectedRevision } } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('date_trunc'), expect.arrayContaining([expectedRevision]))
  })
})
