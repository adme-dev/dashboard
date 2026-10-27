import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rows: vi.fn(), all: vi.fn(), permission: vi.fn(), access: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: mocks.rows }))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  hasAllSocialClientAccess: mocks.all, hasSocialClientPermission: mocks.permission, requireSocialClientAccess: mocks.access
}))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', (event: { query: unknown }) => event.query)
vi.stubGlobal('setHeader', vi.fn())
const projects = (await import('~~/server/api/agency/banner-studio/projects/index.get')).default
const assets = (await import('~~/server/api/agency/banner-studio/assets/index.get')).default
const request = (query = {}) => ({ query }) as unknown as H3Event

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'staff-id' })
  mocks.rows.mockResolvedValue([])
  mocks.all.mockReturnValue(false)
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

  it('rejects an explicit foreign-client filter before reading canvas or signed asset URLs', async () => {
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    await expect(handler(request({ clientId: 'foreign-client' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'foreign-client')
    expect(mocks.rows).not.toHaveBeenCalled()
  })

  it('keeps search and client parameters separate from the caller identity', async () => {
    await handler(request({ clientId: 'assigned-client', search: 'Launch' }))
    // Project search runs after redaction (bannerProjectListSearchRedaction), never in SQL.
    expect(mocks.rows.mock.calls[0]?.[1]).toEqual(_name === 'projects' ? ['staff-id', 'assigned-client'] : ['staff-id', 'assigned-client', '%Launch%'])
    if (_name === 'projects') expect(mocks.rows.mock.calls[0]?.[0]).not.toContain('ILIKE')
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
