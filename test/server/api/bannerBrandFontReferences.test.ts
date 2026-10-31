import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ query: vi.fn(), kit: {} as Record<string, unknown>, snapshot: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ transaction: async (fn: (db: unknown) => unknown) => fn({ query: m.query }) }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'staff' }) }))
vi.mock('~~/server/utils/banner/brandKitAccess', () => ({ requireBrandKitWriteAccess: async () => {}, lockBrandKitForWrite: async () => m.kit.clientId }))
vi.mock('~~/server/utils/banner/brandKits', async original => ({
  ...await original<typeof import('~~/server/utils/banner/brandKits')>(), getBrandKit: async () => m.kit,
  snapshotBrandKitVersion: m.snapshot, setDefaultBrandKit: vi.fn()
}))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('getRouterParam', () => 'kit')
vi.stubGlobal('createError', (input: { statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const create = (await import('~~/server/api/agency/banner-studio/brand-kits/index.post')).default
const patch = (await import('~~/server/api/agency/banner-studio/brand-kits/[id].patch')).default
const duplicate = (await import('~~/server/api/agency/banner-studio/brand-kits/[id]/duplicate.post')).default
const restore = (await import('~~/server/api/agency/banner-studio/brand-kits/[id]/restore.post')).default
const CLIENT = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '22222222-2222-4222-8222-222222222222'
const ID = '33333333-3333-4333-8333-333333333333'
const font = { role: 'heading', family: 'Brand', weights: [700], defaultWeight: 700, assets: [{ id: ID, weight: 700 }] }
beforeEach(() => {
  vi.clearAllMocks()
  m.kit = { clientId: CLIENT, name: 'Kit', fonts: [font], colors: [], logos: [] }
  m.query.mockImplementation(sql => Promise.resolve({ rows: sql.includes('FROM banner_assets')
    ? [{ id: ID, name: 'Brand', clientId: FOREIGN, tags: ['font', 'weight:700'] }]
    : sql.includes('SELECT snapshot') ? [{ snapshot: m.kit }] : sql.includes('SELECT fonts') ? [{ fonts: m.kit.fonts }] : [{ id: 'new-kit' }] }))
})
describe('brand kit font references at write boundaries', () => {
  it.each([
    ['create', create, { name: 'New kit', clientId: CLIENT, fonts: [font] }],
    ['patch', patch, { fonts: [font] }],
    ['duplicate', duplicate, {}],
    ['restore', restore, { version: 1 }]
  ])('rejects cross-client font assets on %s before any mutation', async (_name, handler, body) => {
    await expect((handler as typeof create)({ body } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false)
    expect(m.snapshot).not.toHaveBeenCalled()
  })
  it('revalidates unchanged font assets when moving a kit to another client', async () => {
    m.query.mockImplementation(sql => Promise.resolve({ rows: sql.includes('FROM banner_assets')
      ? [{ id: ID, name: 'Brand', clientId: CLIENT, tags: ['font', 'weight:700'] }]
      : [{ fonts: [font] }] }))
    await expect(patch({ body: { clientId: FOREIGN } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(m.query.mock.calls.some(([sql]) => sql.includes('UPDATE brand_kits'))).toBe(false)
  })
})
