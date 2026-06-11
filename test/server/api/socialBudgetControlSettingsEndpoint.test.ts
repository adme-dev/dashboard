import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockRequireRole = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockGetConfig = vi.fn()
const mockSaveConfig = vi.fn()
let mockBody: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/socialBudgetControlConfig', () => ({
  getSocialBudgetControlConfig: (...args: unknown[]) => mockGetConfig(...args),
  saveSocialBudgetControlConfig: (...args: unknown[]) => mockSaveConfig(...args),
}))

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: () => mockBody,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input),
}))

describe('/api/agency/social/spend/budget-control-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBody = {}
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockRequireRole.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockGetConfig.mockResolvedValue({
      liveBudgetChangesEnabled: false,
      metaBudgetWritesEnabled: false,
      googleBudgetWritesEnabled: false,
    })
  })

  it('returns the selected tenant social budget control config', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/budget-control-settings.get')).default

    const result = await handler({} as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockGetConfig).toHaveBeenCalledWith('tenant-1')
    expect(result).toEqual({
      liveBudgetChangesEnabled: false,
      metaBudgetWritesEnabled: false,
      googleBudgetWritesEnabled: false,
    })
  })

  it('requires an organization for reads', async () => {
    mockGetSelectedTenant.mockResolvedValue(null)
    const handler = (await import('~~/server/api/agency/social/spend/budget-control-settings.get')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'No organization selected',
    })
  })

  it('allows owners and admins to update the persisted toggle state', async () => {
    mockBody = { liveBudgetChangesEnabled: true, metaBudgetWritesEnabled: true }
    const handler = (await import('~~/server/api/agency/social/spend/budget-control-settings.put')).default

    const result = await handler({} as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mockSaveConfig).toHaveBeenCalledWith('tenant-1', {
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: false,
    }, 'user-1')
    expect(result).toEqual({
      ok: true,
      config: {
        liveBudgetChangesEnabled: true,
        metaBudgetWritesEnabled: true,
        googleBudgetWritesEnabled: false,
      },
    })
  })

  it('rejects invalid update bodies', async () => {
    mockBody = { liveBudgetChangesEnabled: 'yes' }
    const handler = (await import('~~/server/api/agency/social/spend/budget-control-settings.put')).default

    await expect(handler({} as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid budget control settings',
    })
  })
})
