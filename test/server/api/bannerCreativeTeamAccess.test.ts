import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const m = vi.hoisted(() => ({ auth: vi.fn(), one: vi.fn(), fresh: vi.fn(), rows: vi.fn(), granted: true }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.one, queryOneFresh: m.fresh, queryRowsFresh: m.rows }))
vi.mock('~~/server/utils/clientScoping', () => ({ hasFreshMarketingManagementPermission: async () => false }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', (event: { query?: unknown }) => event.query || {})
vi.stubGlobal('getRouterParam', () => '11111111-1111-4111-8111-111111111111')
vi.stubGlobal('setHeader', vi.fn())

const { hasAllBannerClientAccess, requireBannerClientAccess } = await import('~~/server/utils/banner/clientAccess')
const { requireSocialClientAccess } = await import('~~/server/utils/social/clientAccess')
const { assertFinancePermission } = await import('~~/server/utils/financeAccess')
const projects = (await import('~~/server/api/agency/banner-studio/projects/index.get')).default
const assets = (await import('~~/server/api/agency/banner-studio/assets/index.get')).default
const detail = (await import('~~/server/api/agency/banner-studio/projects/[id].get')).default
const folders = (await import('~~/server/api/agency/banner-studio/folders/index.get')).default
const CLIENT = '22222222-2222-4222-8222-222222222222'
const user = { id: 'tina', role: 'creative', permissionGroups: ['CREATIVE'] }
const project = { id: 'project', clientId: CLIENT, createdBy: 'another-designer', name: 'Existing client banner' }
const event = (query = {}) => ({ query }) as unknown as H3Event

beforeEach(() => {
  vi.clearAllMocks()
  m.granted = true
  m.auth.mockResolvedValue(user)
  m.one.mockResolvedValue(null) // No client assignments.
  m.rows.mockResolvedValue([project])
  m.fresh.mockImplementation(async (sql: string) => {
    if (sql.includes('rpg.permission_group = \'CREATIVE\'')) return m.granted ? { allowed: true } : null
    if (sql.includes('FROM banner_projects')) return project
    return null // No finance grant.
  })
})

describe('automatic creative team Banner Studio access', () => {
  it.each([projects, assets])('lists the full existing library with no client assignments', async (handler) => {
    await handler(event())
    expect(m.rows).toHaveBeenCalledWith(expect.not.stringContaining('client_team_assignments'), [])
    expect(m.one).not.toHaveBeenCalled()
  })

  it('opens another designer’s client banner and includes its client in the library', async () => {
    await expect(detail(event())).resolves.toEqual(project)
    await expect(projects(event({ clientId: CLIENT }))).resolves.toEqual([project])
    expect(m.rows).toHaveBeenCalledWith(expect.stringContaining('p.client_id = $1'), [CLIENT])
    expect(m.one).not.toHaveBeenCalled()
  })

  it('allows newly added clients automatically without inserting assignment rows', async () => {
    const nextClient = '33333333-3333-4333-8333-333333333333'
    await expect(requireBannerClientAccess(event(), nextClient)).resolves.toEqual(user)
    expect(m.one).not.toHaveBeenCalled()
  })

  it('includes shared agency artwork and the complete folder hierarchy', async () => {
    m.fresh.mockImplementation(async (sql: string) => sql.includes('FROM banner_projects') ? { ...project, clientId: null } : { allowed: true })
    await expect(detail(event())).resolves.toMatchObject({ clientId: null, createdBy: 'another-designer' })
    await folders(event())
    expect(m.rows).toHaveBeenCalledWith(expect.stringContaining('FROM banner_folders'))
  })

  it('does not grant access to social accounts or finance', async () => {
    await expect(requireBannerClientAccess(event(), CLIENT)).resolves.toEqual(user)
    await expect(requireSocialClientAccess(event(), CLIENT)).rejects.toMatchObject({ statusCode: 403 })
    await expect(assertFinancePermission(event(), user.id)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('supports custom creative roles through their current explicit creative grant', async () => {
    const custom = { ...user, role: 'member', permissionGroups: ['CREATIVE'], custom_role_id: 'custom-design-team' }
    m.auth.mockResolvedValue(custom)
    await expect(requireBannerClientAccess(event(), CLIENT)).resolves.toEqual(custom)
    expect(m.fresh).toHaveBeenCalledWith(expect.stringContaining('tm.custom_role_id IS NOT NULL AND cr.id = tm.custom_role_id'), ['tina'])
  })

  it('does not grant the full library from a revoked or inactive creative grant', async () => {
    m.granted = false
    await expect(requireBannerClientAccess(event(), CLIENT)).rejects.toMatchObject({ statusCode: 403 })
    await projects(event())
    expect(m.rows).toHaveBeenCalledWith(expect.stringContaining('client_team_assignments'), ['tina'])
  })

  it.each(['member', 'viewer', 'guest', 'account_manager'])('does not broaden %s access', async (role) => {
    const scoped = { id: 'staff', role, permissionGroups: [] }
    m.auth.mockResolvedValue(scoped)
    await expect(hasAllBannerClientAccess(scoped)).resolves.toBe(false)
    await expect(requireBannerClientAccess(event(), CLIENT)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('fails closed when current creative permission cannot be verified', async () => {
    m.fresh.mockRejectedValue(new Error('database unavailable'))
    await expect(requireBannerClientAccess(event(), CLIENT)).rejects.toMatchObject({ statusCode: 503 })
    expect(m.one).not.toHaveBeenCalled()
  })

  it('rejects invalid client identities before permission or project queries', async () => {
    await expect(requireBannerClientAccess(event(), 'not-a-client')).rejects.toMatchObject({ statusCode: 400 })
    expect(m.fresh).not.toHaveBeenCalled()
  })
})
