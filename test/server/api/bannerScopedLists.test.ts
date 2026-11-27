/* eslint-disable @typescript-eslint/no-explicit-any -- Partial request and database doubles exercise endpoint authority. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rows: vi.fn(), all: vi.fn(), permission: vi.fn(), access: vi.fn(), freshMarketing: vi.fn() }))
vi.mock('~~/server/utils/clientScoping', () => ({ hasFreshMarketingManagementPermission: mocks.freshMarketing }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.rows }))
vi.mock('~~/server/utils/banner/clientAccess', () => ({
  hasAllBannerClientAccess: mocks.all, hasBannerClientPermission: mocks.permission, requireBannerClientAccess: mocks.access
}))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', (event: { query: unknown }) => event.query)
vi.stubGlobal('createError', (input: any) => Object.assign(new Error(input.statusMessage), input))
vi.stubGlobal('setHeader', vi.fn())
const projects = (await import('~~/server/api/agency/banner-studio/projects/index.get')).default
const assets = (await import('~~/server/api/agency/banner-studio/assets/index.get')).default
const request = (query = {}) => ({ query }) as unknown as H3Event

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'staff-id' })
  mocks.rows.mockResolvedValue([])
  mocks.all.mockReturnValue(false)
  mocks.freshMarketing.mockResolvedValue(true)
  mocks.permission.mockReturnValue(true)
  mocks.access.mockReset().mockResolvedValue({ id: 'staff-id' })
})

describe.each([
  ['projects', projects, 'p.created_by', 'p.client_id'],
  ['assets', assets, 'uploaded_by', 'client_id']
] as const)('scoped banner %s listing', (_name, handler, owner, client) => {
  it('restricts unfiltered SQL to assigned clients or the caller\'s unassigned records', async () => {
    await handler(request())
    const [sql, params] = mocks.rows.mock.calls[0]!
    expect(sql).toContain(`${client} IS NULL AND ${owner} = $1`)
    expect(sql).toContain('EXISTS (SELECT 1 FROM client_team_assignments a')
    expect(sql).toContain('a.team_member_id = $1')
    expect(params).toEqual(['staff-id'])
  })

  it('includes every active marketing client without broadening to inactive or unowned agency records', async () => {
    mocks.auth.mockResolvedValue({ id: 'staff-id', permissionGroups: ['MARKETING_MANAGEMENT'] })
    await handler(request())
    const [sql, params] = mocks.rows.mock.calls[0]!
    expect(sql).toContain(`${client} IS NULL AND ${owner} = $1`)
    expect(sql).toContain('is_active = TRUE')
    expect(sql).not.toContain('client_team_assignments')
    expect(params).toEqual(['staff-id'])
  })

  it('rejects a cached marketing role after revocation before returning creative assets', async () => {
    mocks.auth.mockResolvedValue({ id: 'staff-id', permissionGroups: ['MARKETING_MANAGEMENT'] })
    mocks.freshMarketing.mockResolvedValue(false)
    await expect(handler(request())).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.rows).not.toHaveBeenCalled()
  })

  it('rejects an explicit foreign-client filter before reading canvas or signed asset URLs', async () => {
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    await expect(handler(request({ clientId: 'foreign-client' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'foreign-client')
    expect(mocks.rows).not.toHaveBeenCalled()
  })

  it('keeps search and client parameters separate from the caller identity', async () => {
    await handler(request({ clientId: 'assigned-client', search: 'Launch' }))
    expect(mocks.rows.mock.calls[0]?.[1]).toEqual(['staff-id', 'assigned-client', '%Launch%'])
  })

  it('permits all-client staff to browse without an assignment restriction', async () => {
    mocks.all.mockReturnValue(true)
    await handler(request())
    expect(mocks.rows.mock.calls[0]?.[0]).not.toContain('client_team_assignments')
    expect(mocks.rows.mock.calls[0]?.[1]).toEqual([])
  })

  it('does not let assignments bypass the required social permission group', async () => {
    mocks.permission.mockReturnValue(false)
    await handler(request())
    expect(mocks.rows.mock.calls[0]?.[0]).not.toContain('client_team_assignments')
    expect(mocks.rows.mock.calls[0]?.[0]).toContain(`${client} IS NULL AND ${owner} = $1`)
  })
})

describe('lightweight banner library', () => {
  it('selects metadata without returning layer payloads and preserves assignment scoping', async () => {
    await projects(request({ view: 'library' }))
    const [sql, params] = mocks.rows.mock.calls[0]!
    expect(sql).not.toContain('p.canvas_data AS "canvasData"')
    expect(sql).toContain('AS "formats"')
    expect(sql).toContain('AS "populatedFormats"')
    expect(sql).toContain('client_team_assignments')
    expect(params).toEqual(['staff-id'])
  })
  it('reads only format keys for poster galleries under the same client scope', async () => {
    await projects(request({ view: 'gallery' }))
    const [sql, params] = mocks.rows.mock.calls[0]!
    expect(sql).toContain('jsonb_object_keys(p.canvas_data)')
    expect(sql).not.toMatch(/jsonb_each|populatedFormats|AS "canvasData"/)
    expect(sql).toContain('client_team_assignments')
    expect(params).toEqual(['staff-id'])
  })
  it('loads the catalog without inspecting canvases or reading saved thumbnails', async () => {
    await projects(request({ view: 'catalog' }))
    const [sql, params] = mocks.rows.mock.calls[0]!
    expect(sql).not.toMatch(/canvas_data|thumbnail_url/)
    expect(sql).toContain('client_team_assignments')
    expect(params).toEqual(['staff-id'])
  })
  it('loads only the visible cards within the same client scope', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    await projects(request({ view: 'cards', ids: id }))
    const [sql, params] = mocks.rows.mock.calls[0]!
    expect(sql).toContain('p.id = ANY($2::uuid[])')
    expect(sql).toContain('client_team_assignments')
    expect(params).toEqual(['staff-id', [id]])
  })
  it.each([undefined, '', 'invalid', Array(37).fill('22222222-2222-4222-8222-222222222222').join(',')])('rejects unbounded or invalid card requests', async (ids) => {
    await expect(projects(request({ view: 'cards', ids }))).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.rows).not.toHaveBeenCalled()
  })
  it('searches off-page sizes without retrieving thumbnails or names', async () => {
    await projects(request({ view: 'dimensions' }))
    const [sql] = mocks.rows.mock.calls[0]!
    expect(sql).toContain('jsonb_object_keys(p.canvas_data)')
    expect(sql).toContain('client_team_assignments')
    expect(sql).not.toMatch(/thumbnail_url|p.name|AS "canvasData"/)
  })
  it('retains full canvases for existing API consumers', async () => {
    await projects(request())
    expect(mocks.rows.mock.calls[0]![0]).toContain('p.canvas_data AS "canvasData"')
  })
})
