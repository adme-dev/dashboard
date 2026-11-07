import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ auth: vi.fn(), finance: vi.fn(), one: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: m.finance, assertPermissionGrant: vi.fn().mockResolvedValue(undefined) }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.one }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('readBody', (event: { body: unknown }) => event.body)
vi.stubGlobal('getRouterParam', () => 'member')
const create = (await import('~~/server/api/agency/team-members/index.post')).default
const update = (await import('~~/server/api/agency/team-members/[id].put')).default
const row = { id: 'member', name: 'Staff', email: 'staff@example.com', role: 'member', hourly_rate: 150, hourly_cost: 80, target_utilization: 120, is_active: true }
const event = (body: Record<string, unknown>) => ({ body, context: {} }) as never
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ id: 'user', role: 'owner', permissionGroups: ['FINANCE'] })
  m.finance.mockRejectedValue(Object.assign(new Error('Denied'), { statusCode: 403 }))
  m.one.mockImplementation(async (sql: string) => sql.includes('WHERE email =') ? null : row)
})
describe('team rate write and mutation response isolation', () => {
  it.each([['create', create], ['update', update]] as const)('%s cannot expose rates through an operational mutation response', async (_name, handler) => {
    const result = await handler(event({ name: 'Staff', email: 'staff@example.com', targetUtilization: 120 }))
    expect(result.member).toMatchObject({ id: 'member', targetUtilization: 120 })
    expect(result.member).not.toHaveProperty('hourlyRate')
    expect(result.member).not.toHaveProperty('hourlyCost')
    const writeSql = m.one.mock.calls.find(([sql]) => /INSERT INTO team_members|UPDATE team_members/.test(sql))![0]
    expect(writeSql).not.toContain('RETURNING *')
  })
  it.each([['create-rate', create, { name: 'Staff', email: 'staff@example.com', hourlyRate: 150 }], ['update-cost', update, { hourlyCost: 80 }]] as const)('%s requires explicit finance write permission before any DB work', async (_name, handler, body) => {
    await expect(handler(event(body))).rejects.toMatchObject({ statusCode: 403 })
    expect(m.finance).toHaveBeenCalledWith(expect.anything(), 'user', true)
    expect(m.one).not.toHaveBeenCalled()
  })
  it('retains rate fields for a freshly granted finance write', async () => {
    m.finance.mockResolvedValue(undefined)
    expect(await update(event({ hourlyRate: 150, hourlyCost: 80 }))).toMatchObject({ member: { hourlyRate: 150, hourlyCost: 80 } })
  })
  it('fails closed before an operational write on permission DB errors', async () => {
    m.finance.mockRejectedValue(Object.assign(new Error('Unavailable'), { statusCode: 503 }))
    await expect(update(event({ name: 'Staff' }))).rejects.toMatchObject({ statusCode: 503 })
    expect(m.one).not.toHaveBeenCalled()
  })
})
