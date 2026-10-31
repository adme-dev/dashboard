import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ query: vi.fn(), access: vi.fn(), transactions: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: async (fn: (db: unknown) => unknown) => {
  m.transactions()
  return fn({ query: m.query })
} }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: 'staff' }) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: m.access }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async () => ({ versionId: 'version' }))
vi.stubGlobal('createError', (input: { statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const restore = (await import('~~/server/api/agency/banner-studio/versions/restore.post')).default
const ID = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const canvas = { mrec: { layers: [{ fontAssetId: ID, fontFamily: 'Brand', fontWeight: 700 }] } }
let currentClient = CLIENT
beforeEach(() => {
  vi.clearAllMocks()
  currentClient = CLIENT
  m.query.mockImplementation(sql => Promise.resolve({ rows: sql.includes('FROM banner_versions WHERE id')
    ? [{ projectId: 'project', canvasData: canvas }]
    : sql.includes('FROM banner_projects')
      ? [{ client_id: currentClient, canvas_data: {} }]
      : sql.includes('FROM banner_assets')
        ? [{ id: ID, name: 'Brand', clientId: CLIENT, tags: ['font', 'weight:700'] }]
        : [{ id: 'project', canvasData: canvas }] }))
})
describe('project version font restoration', () => {
  it('locks current ownership and exact font rows before snapshot and update', async () => {
    await restore({} as never)
    expect(m.transactions).toHaveBeenCalledTimes(1)
    expect(m.query.mock.calls[1][0]).toContain('FOR UPDATE')
    expect(m.query.mock.calls[2][0]).toContain('FOR SHARE')
    expect(m.query.mock.calls[3][0]).toContain('INSERT INTO banner_versions')
    expect(m.query.mock.calls[4][0]).toContain('UPDATE banner_projects')
    expect(m.access).toHaveBeenCalledWith(expect.anything(), CLIENT)
  })
  it('rejects the old client face if the project moved before the locked read', async () => {
    currentClient = '33333333-3333-4333-8333-333333333333'
    await expect(restore({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query.mock.calls.some(([sql]) => /INSERT INTO|UPDATE banner_projects/.test(sql))).toBe(false)
  })
})
