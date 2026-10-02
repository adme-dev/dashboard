import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ clientAccess: vi.fn(), allAccess: vi.fn(), query: vi.fn(), snapshot: vi.fn(), defaultKit: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: async () => ({ id: 'creative' }) }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.clientAccess, requireAllSocialClientAccess: mocks.allAccess }))
vi.mock('~~/server/utils/db', () => ({ transaction: async (fn: (db: unknown) => unknown) => fn({ query: mocks.query }) }))
vi.mock('~~/server/utils/banner/brandKits', async original => ({
  ...await original<typeof import('~~/server/utils/banner/brandKits')>(),
  getBrandKit: async () => ({ clientId: 'client-a', isDefault: true }),
  snapshotBrandKitVersion: mocks.snapshot, setDefaultBrandKit: mocks.defaultKit
}))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', () => 'kit-1')
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
const patch = (await import('../../server/api/agency/banner-studio/brand-kits/[id].patch')).default as unknown as (event: { body: unknown }) => Promise<unknown>
const restore = (await import('../../server/api/agency/banner-studio/brand-kits/[id]/restore.post')).default as unknown as (event: { body: unknown }) => Promise<unknown>
const remove = (await import('../../server/api/agency/banner-studio/brand-kits/[id].delete')).default as unknown as (event: unknown) => Promise<unknown>
beforeEach(() => {
  vi.resetAllMocks()
  mocks.query.mockResolvedValue({ rows: [{ client_id: 'client-a' }] })
  mocks.clientAccess.mockRejectedValue(Object.assign(new Error('No access to this client'), { statusCode: 403 }))
})
describe('shared Brand Kit mutations', () => {
  it.each([patch, restore, remove])('rejects foreign client mutations before changing any content', async (handler) => {
    await expect(handler({ body: { guidelines: 'Foreign edit', version: 1 } })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.snapshot).not.toHaveBeenCalled()
    expect(mocks.query.mock.calls.some(([sql]) => /UPDATE|DELETE|INSERT/.test(sql.replace('FOR UPDATE', '')))).toBe(false)
  })
  it('checks both the current and destination clients on reassignment', async () => {
    const destination = 'bc8a15a8-f523-4a75-a8f4-a501649bb71d'
    mocks.clientAccess.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('Foreign destination'), { statusCode: 403 }))
    await expect(patch({ body: { clientId: destination } })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.clientAccess.mock.calls.map(call => call[1])).toEqual(['client-a', destination])
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('UPDATE brand_kits'))).toBe(false)
  })
  it('requires agency access before moving a kit into the shared agency scope', async () => {
    mocks.clientAccess.mockResolvedValue({})
    mocks.allAccess.mockRejectedValue(Object.assign(new Error('Not agency manager'), { statusCode: 403 }))
    await expect(patch({ body: { clientId: null } })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.allAccess).toHaveBeenCalled()
  })
  it('clears a moved default in the ownership statement before selecting a new default', async () => {
    mocks.clientAccess.mockResolvedValue({})
    await patch({ body: { clientId: 'bc8a15a8-f523-4a75-a8f4-a501649bb71d', isDefault: true } })
    const [sql] = mocks.query.mock.calls.find(([sql]) => sql.includes('client_id = CASE'))!
    expect(sql).toContain('is_default = CASE WHEN $3::boolean AND client_id IS DISTINCT FROM $4::uuid THEN false ELSE is_default END')
    expect(mocks.defaultKit).toHaveBeenCalledWith('kit-1', 'bc8a15a8-f523-4a75-a8f4-a501649bb71d', expect.anything())
  })
  it('locks ownership, snapshots an allowed guide edit and changes defaults in the same transaction', async () => {
    mocks.clientAccess.mockResolvedValue({})
    await patch({ body: { guidelines: 'Owned guide', isDefault: true } })
    expect(mocks.query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(mocks.snapshot).toHaveBeenCalled()
    expect(mocks.defaultKit).toHaveBeenCalledWith('kit-1', 'client-a', expect.objectContaining({ query: mocks.query }))
  })
})
