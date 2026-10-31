import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ rows: vi.fn(), query: vi.fn(), access: vi.fn(), all: vi.fn(), remove: vi.fn(), user: { id: 'staff', role: 'creative', permissionGroups: [] as string[] } }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: m.rows, transaction: async (fn: (db: unknown) => unknown) => fn({ query: m.query }) }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => m.user, requireRole: async () => m.user }))
vi.mock('~~/server/utils/clientScoping', () => ({ hasFreshMarketingManagementPermission: async () => true }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ hasSocialClientPermission: () => true, hasAllSocialClientAccess: () => false, requireSocialClientAccess: m.access, requireAllSocialClientAccess: m.all }))
vi.mock('~~/server/utils/banner/fontDelivery', () => ({ withBannerFontDelivery: async (_event: unknown, fonts: unknown[]) => fonts }))
vi.mock('~~/server/utils/bannerStorage', () => ({ deleteBannerFile: m.remove }))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: () => ({ nativeUpload: { bucket: 'native-bucket' } }) }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.stubGlobal('getQuery', (event: { query?: unknown }) => event.query || {})
vi.stubGlobal('getRouterParam', (event: { id: string }) => event.id)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('createError', (input: { statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const list = (await import('~~/server/api/agency/banner-studio/fonts/index.get')).default
const genericPatch = (await import('~~/server/api/agency/banner-studio/assets/[id].patch')).default
const genericRemove = (await import('~~/server/api/agency/banner-studio/assets/[id].delete')).default
const remove = (await import('~~/server/api/agency/banner-studio/fonts/[id].delete')).default
const ID = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  vi.resetAllMocks()
  m.rows.mockResolvedValue([{ id: ID, name: 'Brand', tags: ['font'], clientId: null }])
  m.query.mockImplementation(sql => Promise.resolve({ rows: sql.includes('FOR UPDATE') ? [{ id: ID, name: 'Brand', client_id: CLIENT, r2_key: 'font-key' }] : [] }))
})
describe('font scope boundaries', () => {
  it('lists selected client plus shared fonts only after client authorization', async () => {
    const result = await list({ query: { clientId: CLIENT } } as never)
    expect(m.access).toHaveBeenCalledWith(expect.anything(), CLIENT)
    expect(m.rows.mock.calls[0][0]).toContain('(client_id IS NULL OR client_id = $1::uuid)')
    expect(result[0]).toMatchObject({ id: ID, clientId: null, sha256: null })
  })
  it('supports shared-only scope without inventing a client assignment', async () => {
    await list({ query: { clientId: '__agency__' } } as never)
    expect(m.rows.mock.calls[0][0]).toContain('AND client_id IS NULL')
    expect(m.access).not.toHaveBeenCalled()
  })
  it('limits the unfiltered catalog to assigned clients and shared fonts', async () => {
    await list({} as never)
    expect(m.rows.mock.calls[0][0]).toContain('client_team_assignments')
    expect(m.rows.mock.calls[0][1]).toEqual(['staff'])
  })
  it('rejects foreign client reads before querying fonts', async () => {
    m.access.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(list({ query: { clientId: CLIENT } } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.rows).not.toHaveBeenCalled()
  })
  it('blocks deletion while any current or versioned reference exists', async () => {
    m.query.mockImplementation(sql => Promise.resolve({ rows: sql.includes('FOR UPDATE') ? [{ id: ID, name: 'Brand', client_id: CLIENT, r2_key: 'font-key' }] : [{ used: 1 }] }))
    await expect(remove({ id: ID } as never)).rejects.toMatchObject({ statusCode: 409 })
    const sql = m.query.mock.calls[1][0]
    for (const table of ['brand_kits', 'brand_kit_versions', 'banner_projects', 'banner_versions']) expect(sql).toContain(table)
    expect(sql).toContain('fontAssetId')
    expect(sql).toContain('fontFamily')
    expect(sql).toContain('!exists(@.fontAssetId)')
    expect(sql).toContain('!exists(@.assets)')
    expect(sql).toContain('WHEN jsonb_typeof(content) = \'string\' THEN (content #>> \'{}\')::jsonb')
    expect(m.remove).not.toHaveBeenCalled()
  })
  it('prevents the generic asset route from bypassing font reference protection', async () => {
    m.query.mockResolvedValue({ rows: [{ id: ID, r2_key: 'font-key', tags: ['font'] }] })
    await expect(genericRemove({ id: ID } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(m.query.mock.calls).toHaveLength(1)
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('prevents generic tag removal or font-tag promotion', async () => {
    m.query.mockResolvedValueOnce({ rows: [{ tags: ['font'] }] })
    await expect(genericPatch({ id: ID, body: { tags: [] } } as never)).rejects.toMatchObject({ statusCode: 409 })
    m.query.mockResolvedValueOnce({ rows: [{ tags: [] }] })
    await expect(genericPatch({ id: ID, body: { tags: ['font'] } } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query.mock.calls.every(([sql]) => sql.includes('FOR UPDATE'))).toBe(true)
  })

  it.each([
    ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AAAAaaaa-AAAA-4aaa-8AAA-aaaaAAAAAAAA']
  ])('blocks deletion regardless of route UUID %s and stored UUID case', async (routeId, savedId) => {
    m.query.mockImplementation((sql, params) => {
      if (sql.includes('FOR UPDATE')) return Promise.resolve({ rows: [{ id: routeId.toLowerCase(), name: 'Brand', client_id: CLIENT, r2_key: 'font-key' }] })
      const matches = sql.includes('lower(exact_refs.value #>> \'{}\') = lower($1::text)') && savedId.toLowerCase() === params[0].toLowerCase()
      return Promise.resolve({ rows: matches ? [{ used: 1 }] : [] })
    })
    await expect(remove({ id: routeId } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(m.query.mock.calls[1][0]).toContain('\'$.**.fontAssetId\'')
    expect(m.query.mock.calls[1][0]).toContain('\'$.**.id\'')
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('keeps ordinary image deletion available', async () => {
    m.query.mockImplementation(sql => Promise.resolve({ rows: sql.includes('FOR UPDATE') ? [{ r2_key: 'image-key', tags: ['logo'] }] : [] }))
    await genericRemove({ id: ID } as never)
    expect(m.remove).toHaveBeenCalledWith('image-key')
  })

  it('deletes an authorized unused font with native object storage', async () => {
    await remove({ id: ID } as never)
    expect(m.access).toHaveBeenCalledWith(expect.anything(), CLIENT)
    expect(m.query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(m.query.mock.calls.at(-1)?.[0]).toContain('DELETE FROM banner_assets')
    expect(m.remove).toHaveBeenCalledWith('font-key', 'native-bucket')
  })
})
