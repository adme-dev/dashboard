import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG, mergeBudgetControlConfig } from '~~/server/utils/socialBudgetControlConfig'

const mockQueryOne = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

describe('budget control config caps', () => {
  it('has safe cap defaults', () => {
    expect(DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG.maxMultiple).toBe(2)
    expect(DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG.monthlyMarginPct).toBe(0.1)
  })

  it('merges stored partial config over defaults', () => {
    const merged = mergeBudgetControlConfig({ maxMultiple: 1.5 })
    expect(merged.maxMultiple).toBe(1.5)
    expect(merged.monthlyMarginPct).toBe(0.1)
    expect(merged.liveBudgetChangesEnabled).toBe(false)
  })
})

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
      maxMultiple: 2,
      monthlyMarginPct: 0.1,
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
      maxMultiple: 2,
      monthlyMarginPct: 0.1,
    })
  })

  it('saves the social budget control config in agency settings', async () => {
    const { saveSocialBudgetControlConfig } = await import('~~/server/utils/socialBudgetControlConfig')

    await saveSocialBudgetControlConfig('tenant-1', {
      liveBudgetChangesEnabled: true,
      metaBudgetWritesEnabled: true,
      googleBudgetWritesEnabled: false,
      maxMultiple: 2,
      monthlyMarginPct: 0.1,
    }, 'user-1')

    expect(mockExecute).toHaveBeenCalledOnce()
    expect(String(mockExecute.mock.calls[0][0])).toContain("VALUES ($1, 'social_budget_control'")
    expect(mockExecute.mock.calls[0][1]).toEqual([
      'tenant-1',
      JSON.stringify({
        liveBudgetChangesEnabled: true,
        metaBudgetWritesEnabled: true,
        googleBudgetWritesEnabled: false,
        maxMultiple: 2,
        monthlyMarginPct: 0.1,
      }),
      'user-1',
    ])
  })
})
