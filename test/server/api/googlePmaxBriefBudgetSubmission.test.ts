import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryOneMock = vi.fn()
const queryRowsMock = vi.fn()
const executeMock = vi.fn()
const readBodyMock = vi.fn()

Object.assign(globalThis, {
  defineEventHandler: <T>(handler: T) => handler,
  readBody: readBodyMock,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(
    new Error(input.statusMessage),
    input
  )
})

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  queryRows: (...args: unknown[]) => queryRowsMock(...args),
  execute: (...args: unknown[]) => executeMock(...args)
}))

vi.mock('~~/server/utils/auth', () => ({
  getAuthUser: vi.fn().mockResolvedValue({ id: 'user-1' })
}))

vi.mock('~~/server/utils/briefNotifications', () => ({
  notifyBriefSubmitted: vi.fn().mockResolvedValue(undefined),
  notifyBriefAssigned: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('~~/server/utils/automation/briefGatekeeperRunner', () => ({
  runBriefGatekeeper: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('~~/server/utils/briefPriority', () => ({
  normalizeBriefPriority: (_value: unknown, fallback: string) => fallback
}))

const conditionalFields = [
  {
    field_key: 'pmax_type',
    field_label: 'Campaign Type',
    field_type: 'dropdown',
    options: [
      { label: 'Standard', value: 'standard' },
      { label: 'Inventory (Vehicle Ads)', value: 'inventory' }
    ],
    is_required: true,
    validation_rules: null,
    conditional_logic: null
  },
  {
    field_key: 'budget_period',
    field_label: 'Budget Period',
    field_type: 'dropdown',
    options: [{ label: 'Fixed flight', value: 'fixed_flight' }],
    is_required: true,
    validation_rules: null,
    conditional_logic: null
  },
  {
    field_key: 'budget_currency',
    field_label: 'Budget Currency',
    field_type: 'dropdown',
    options: [{ label: 'Australian dollar', value: 'AUD' }],
    is_required: true,
    validation_rules: null,
    conditional_logic: null
  },
  {
    field_key: 'allocated_total',
    field_label: 'Approved Total Allocation',
    field_type: 'currency',
    options: [],
    is_required: false,
    validation_rules: { min: 0.01 },
    conditional_logic: { fieldKey: 'pmax_type', operator: 'equals', value: 'inventory', action: 'require' }
  },
  {
    field_key: 'end_date',
    field_label: 'End Date',
    field_type: 'date',
    options: [],
    is_required: false,
    validation_rules: null,
    conditional_logic: { fieldKey: 'pmax_type', operator: 'equals', value: 'inventory', action: 'require' }
  }
]

const baseBody = {
  templateId: 'template-1',
  title: 'CP Ford PMax Inventory',
  fieldValues: {
    pmax_type: 'inventory',
    budget_period: 'fixed_flight',
    budget_currency: 'AUD',
    start_date: '2026-07-17',
    end_date: '2026-07-31',
    allocated_total: 1_000
  }
}

describe('Google PMax brief budget submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryOneMock.mockResolvedValue({
      id: 'template-1',
      slug: 'google-pmax',
      name: 'Google Performance Max',
      default_priority: 'high',
      requires_approval: true,
      auto_assign_to: null,
      auto_assign_department: null,
      require_client_link: false
    })
    queryRowsMock.mockImplementation((sql: string) => {
      if (sql.includes('is_required = true')) {
        return conditionalFields.filter(field => field.is_required)
      }
      return conditionalFields
    })
    readBodyMock.mockResolvedValue(baseBody)
  })

  it.each([
    ['Approved Total Allocation', { allocated_total: undefined }],
    ['End Date', { end_date: undefined }]
  ])('rejects an Inventory brief without %s', async (label, override) => {
    readBodyMock.mockResolvedValue({
      ...baseBody,
      fieldValues: { ...baseBody.fieldValues, ...override }
    })
    const handler = (await import('~~/server/api/agency/briefs/index.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: `Missing required fields: ${label}`
    })
  })

  it('cannot bypass required budget validation by omitting fieldValues', async () => {
    readBodyMock.mockResolvedValue({
      templateId: 'template-1',
      title: 'CP Ford PMax Inventory'
    })
    const handler = (await import('~~/server/api/agency/briefs/index.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('Budget Period')
    })
  })

  it('rejects a non-positive Inventory allocation at the server boundary', async () => {
    readBodyMock.mockResolvedValue({
      ...baseBody,
      fieldValues: { ...baseBody.fieldValues, allocated_total: 0 }
    })
    const handler = (await import('~~/server/api/agency/briefs/index.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Approved Total Allocation must be at least 0.01'
    })
  })

  it('rejects a non-numeric Inventory allocation at the server boundary', async () => {
    readBodyMock.mockResolvedValue({
      ...baseBody,
      fieldValues: { ...baseBody.fieldValues, allocated_total: 'daily pace' }
    })
    const handler = (await import('~~/server/api/agency/briefs/index.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Approved Total Allocation must be a number'
    })
  })

  it.each([
    true,
    [1_000],
    { approved: 1_000 }
  ])('rejects non-scalar monetary JSON instead of coercing %j', async (allocatedTotal) => {
    readBodyMock.mockResolvedValue({
      ...baseBody,
      fieldValues: { ...baseBody.fieldValues, allocated_total: allocatedTotal }
    })
    const handler = (await import('~~/server/api/agency/briefs/index.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Approved Total Allocation must be a number'
    })
  })

  it.each([
    ['array', ['inventory']],
    ['unknown option', 'vehicle_inventory']
  ])('rejects malformed Campaign Type %s before conditional validation', async (_label, pmaxType) => {
    readBodyMock.mockResolvedValue({
      ...baseBody,
      fieldValues: { ...baseBody.fieldValues, pmax_type: pmaxType }
    })
    const handler = (await import('~~/server/api/agency/briefs/index.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Campaign Type has an invalid selection'
    })
  })
})
