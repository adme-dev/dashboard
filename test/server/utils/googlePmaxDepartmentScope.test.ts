import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockResolveStaff = vi.fn()
const mockCovers = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryRowsFresh = vi.fn()

vi.mock('h3', () => ({
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: (...a: unknown[]) => mockResolveStaff(...a) }))
vi.mock('~~/server/utils/ai/marketing/reviewAuthority', () => ({ freshContextCoversClient: (...a: unknown[]) => mockCovers(...a) }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  queryRowsFresh: (...a: unknown[]) => mockQueryRowsFresh(...a),
  queryOne: vi.fn(),
  queryOneFresh: vi.fn(),
  transaction: vi.fn()
}))

const tenant = 'c41c58be-a3a8-4479-b5d1-9251bb80717d'
const client = '8d28740e-6239-4ab6-8d82-cd03aa10d5ea'
const staff = { id: '10ea5019-e05f-476f-971e-a73a3bc6930c', role: 'marketing', permissionGroups: ['MARKETING_MANAGEMENT'] }

describe('PMax browser department portfolio scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(staff)
    mockResolveStaff.mockResolvedValue({ permissionGroups: ['MARKETING_MANAGEMENT'], assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] } })
    mockCovers.mockResolvedValue(true)
    mockQueryRows.mockResolvedValue([])
    mockQueryRowsFresh.mockResolvedValue([])
  })

  it('leaves legacy media-buying and all-social users on their existing path', async () => {
    const { resolvePmaxDepartmentPortfolio } = await import('~~/server/utils/googlePmaxDepartmentScope')
    mockRequireAuth.mockResolvedValue({ ...staff, permissionGroups: ['MEDIA_BUYING'] })
    expect(await resolvePmaxDepartmentPortfolio({} as never)).toBeNull()
    mockRequireAuth.mockResolvedValue({ ...staff, permissionGroups: ['MARKETING_MANAGEMENT', 'ADMIN'] })
    expect(await resolvePmaxDepartmentPortfolio({} as never)).toBeNull()
    expect(mockResolveStaff).not.toHaveBeenCalled()
  })

  it('uses fresh role policy rather than cached session groups', async () => {
    const { resolvePmaxDepartmentPortfolio } = await import('~~/server/utils/googlePmaxDepartmentScope')
    mockResolveStaff.mockResolvedValue({ permissionGroups: ['CREATIVE'], assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] } })
    await expect(resolvePmaxDepartmentPortfolio({} as never)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns all current active clients or the fresh assigned set, and checks a named client', async () => {
    const { resolvePmaxDepartmentPortfolio } = await import('~~/server/utils/googlePmaxDepartmentScope')
    expect(await resolvePmaxDepartmentPortfolio({} as never)).toEqual({ userId: staff.id, clientIds: undefined })
    mockResolveStaff.mockResolvedValue({ permissionGroups: ['MARKETING_MANAGEMENT'], assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [client] } })
    expect(await resolvePmaxDepartmentPortfolio({} as never)).toEqual({ userId: staff.id, clientIds: [client] })
    mockCovers.mockResolvedValue(false)
    await expect(resolvePmaxDepartmentPortfolio({} as never, client)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('filters launch and preparable-brief SQL to fresh active (and optionally assigned) clients', async () => {
    const { listGooglePmaxLaunches } = await import('~~/server/utils/googlePmaxLaunchStore')
    const { createGooglePmaxLaunchPreparation } = await import('~~/server/utils/googlePmaxLaunchPreparation')
    await listGooglePmaxLaunches({ tenantId: tenant, activeClientsOnly: true, clientIds: [client], limit: 10 })
    expect(mockQueryRows).not.toHaveBeenCalled()
    const [sql, params] = mockQueryRowsFresh.mock.calls[0]!
    expect(sql).toMatch(/ac\.is_active = TRUE/)
    expect(sql).toMatch(/client_id = ANY\(\$2::uuid\[\]\)/)
    expect(params).toEqual([tenant, [client], 10])
    const freshRows = vi.fn().mockResolvedValue([])
    await createGooglePmaxLaunchPreparation({ queryRows: freshRows as never }).list({ tenantId: tenant, activeClientsOnly: true, limit: 5 })
    expect(freshRows.mock.calls[0]![0]).toMatch(/c\.is_active = TRUE/)
    expect(freshRows.mock.calls[0]![0]).not.toMatch(/ANY\(/)
  })
})
