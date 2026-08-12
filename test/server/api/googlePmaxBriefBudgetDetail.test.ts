import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryOneMock = vi.fn()
const queryRowsMock = vi.fn()

Object.assign(globalThis, {
  defineEventHandler: <T>(handler: T) => handler,
  getRouterParam: () => 'brief-1',
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
})

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  queryRows: (...args: unknown[]) => queryRowsMock(...args)
}))

const briefRow = {
  id: 'brief-1',
  template_id: 'template-1',
  template_name: 'Google Performance Max',
  template_slug: 'google-pmax',
  category_id: 'category-1',
  category_name: 'Paid Media',
  status: 'approved',
  priority: 'high',
  budget_currency: 'AUD',
  source: 'internal',
  quote_id: null
}

function rows(fields: Array<{ fieldKey: string, value: unknown }>) {
  return fields.map((field, index) => ({
    id: `value-${index}`,
    brief_id: 'brief-1',
    field_id: `field-${index}`,
    field_key: field.fieldKey,
    field_label: field.fieldKey,
    field_type: 'text',
    value: field.value,
    step_number: 1,
    section: 'Budget',
    sort_order: index
  }))
}

async function getBrief(fieldValues: ReturnType<typeof rows>) {
  queryRowsMock
    .mockResolvedValueOnce(fieldValues)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
  const handler = (await import('~~/server/api/agency/briefs/[id].get')).default
  return handler({} as never)
}

describe('Google PMax brief budget detail response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryOneMock.mockResolvedValue(briefRow)
  })

  it('includes the server-reconciled CP Ford provider contract', async () => {
    const response = await getBrief(rows([
      { fieldKey: 'pmax_type', value: 'inventory' },
      { fieldKey: 'budget_period', value: 'fixed_flight' },
      { fieldKey: 'allocated_total', value: 1_000 },
      { fieldKey: 'budget_currency', value: 'AUD' },
      { fieldKey: 'start_date', value: '2026-07-17' },
      { fieldKey: 'end_date', value: '2026-07-31' }
    ]))

    expect(response.budgetReconciliation).toMatchObject({
      status: 'ready',
      launchBlocked: false,
      contract: {
        campaignDays: 15,
        calculatedDailyPace: 1_000 / 15,
        provider: {
          totalAmountMicros: '1000000000',
          amountMicros: null
        }
      }
    })
  })

  it('keeps a legacy daily-only brief readable while blocking launch readiness', async () => {
    const response = await getBrief(rows([
      { fieldKey: 'pmax_type', value: 'inventory' },
      { fieldKey: 'daily_budget', value: 66.67 },
      { fieldKey: 'start_date', value: '2026-07-17' },
      { fieldKey: 'end_date', value: '2026-07-31' }
    ]))

    expect(response.fieldValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'daily_budget', value: 66.67 })
    ]))
    expect(response.budgetReconciliation).toMatchObject({
      status: 'legacy_ambiguous',
      launchBlocked: true,
      legacyDailyBudget: 66.67,
      contract: null
    })
  })
})
