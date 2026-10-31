import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ user: { id: 'staff', permissionGroups: [] as string[] }, all: false, permission: true, fresh: true, access: vi.fn(), rows: vi.fn(), kit: null as Record<string, unknown> | null }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => m.user }))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: m.access, requireAllSocialClientAccess: vi.fn(),
  hasSocialClientPermission: () => m.permission, hasAllSocialClientAccess: () => m.all
}))
vi.mock('~~/server/utils/clientScoping', () => ({ hasFreshMarketingManagementPermission: async () => m.fresh }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: m.rows }))
vi.mock('~~/server/utils/banner/brandKits', () => ({ getBrandKit: async () => m.kit, BRAND_KIT_SELECT: 'bk.id', normaliseKitRow: (row: unknown) => row }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', () => 'kit')
vi.stubGlobal('getQuery', (event: { query?: unknown }) => event.query || {})
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('createError', (input: { statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const list = (await import('~~/server/api/agency/banner-studio/brand-kits/index.get')).default
const get = (await import('~~/server/api/agency/banner-studio/brand-kits/[id].get')).default
const versions = (await import('~~/server/api/agency/banner-studio/brand-kits/[id]/versions.get')).default
beforeEach(() => {
  vi.clearAllMocks()
  m.all = false
  m.permission = true
  m.fresh = true
  m.user.permissionGroups = []
  m.kit = { id: 'kit', clientId: 'client-a', fonts: [] }
  m.rows.mockResolvedValue([])
})
describe('brand kit read scopes', () => {
  it('limits unfiltered lists to assigned clients and shared kits', async () => {
    await list({} as never)
    expect(m.rows.mock.calls[0][0]).toContain('client_team_assignments')
    expect(m.rows.mock.calls[0][1]).toEqual(['staff'])
  })
  it('checks a requested client before listing that scope plus shared kits', async () => {
    await list({ query: { clientId: 'client-a' } } as never)
    expect(m.access).toHaveBeenCalledWith(expect.anything(), 'client-a')
    expect(m.rows.mock.calls[0][0]).toContain('bk.client_id = $1::uuid OR bk.client_id IS NULL')
    m.access.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 403 }))
    m.rows.mockClear()
    await expect(list({ query: { clientId: 'foreign' } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.rows).not.toHaveBeenCalled()
  })
  it.each([get, versions])('rejects foreign kit details or versions before returning content', async (handler) => {
    m.access.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 403 }))
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.rows).not.toHaveBeenCalled()
  })
  it('binds version reads to the client scope that was authorized', async () => {
    await versions({} as never)
    expect(m.rows.mock.calls[0][0]).toContain('authorized_kit.client_id IS NOT DISTINCT FROM $2::uuid')
    expect(m.rows.mock.calls[0][1]).toEqual(['kit', 'client-a'])
  })

  it('allows shared kit reads but denies revoked portfolio lists', async () => {
    m.kit!.clientId = null
    expect(await get({} as never)).toEqual(m.kit)
    expect(m.access).not.toHaveBeenCalled()
    m.user.permissionGroups = ['MARKETING_MANAGEMENT']
    m.fresh = false
    await expect(list({} as never)).rejects.toMatchObject({ statusCode: 403 })
  })
})
