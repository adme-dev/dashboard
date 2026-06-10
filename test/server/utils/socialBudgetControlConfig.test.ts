import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

describe('socialBudgetControlConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults live platform budget writes off', async () => {
    mockQueryOne.mockResolvedValue(null)
    const { getSocialBudgetControlConfig } = await import('~~/server/utils/socialBudgetControlConfig')

    await expect(getSocialBudgetControlConfig('tenant-1')).resolves.toEqual({
      liveBudgetChangesEnabled: false,
      metaBudgetWritesEnabled: false,
      googleBudgetWritesEnabled: false,
    })
    expect(String(mockQueryOne.mock.calls[0][0])).toContain("key = 'social_budget_control'")
    expect(mockQueryOne.mock.calls[0][1]).toEqual(['tenant-1'])
  })

  it('merges stored values over the default-off config', async () => {
    mockQueryOne.mockResolvedValue({
      value: {
        liveBudgetChangesEnabled: true,
        metaBudgetWritesEnabled: true,
      },
    })
    const { getSocialBudgetControlConfig } = await import('~~/server/utils/socialBudgetControlConfig')

    await expect(getSocialBudgetControlConfig('tenant-1')).resolves.toEqual({
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: false,
    })
  })

  it('saves the social budget control config in agency settings', async () => {
    const { saveSocialBudgetControlConfig } = await import('~~/server/utils/socialBudgetControlConfig')

    await saveSocialBudgetControlConfig('tenant-1', {
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: false,
    }, 'user-1')

    expect(mockExecute).toHaveBeenCalledOnce()
    expect(String(mockExecute.mock.calls[0][0])).toContain("VALUES ($1, 'social_budget_control'")
    expect(mockExecute.mock.calls[0][1]).toEqual([
      'tenant-1',
      JSON.stringify({
        liveBudgetChangesEnabled: true,
        metaBudgetWritesEnabled: true,
        googleBudgetWritesEnabled: false,
      }),
      'user-1',
    ])
  })
})
