import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const TARGET_ID = '33333333-3333-4333-8333-333333333333'

const ownerContext: CrmSearchContext = {
  organisationScopeId: '44444444-4444-4444-8444-444444444444',
  clientId: CLIENT_ID,
  correlationId: '55555555-5555-4555-8555-555555555555',
  actorType: 'staff',
  actorId: ACTOR_ID,
  surface: 'agency_global',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true }
}

const mocks = vi.hoisted(() => ({
  queryRows: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mocks.queryRows(...args),
  queryOne: (...args: unknown[]) => mocks.queryOne(...args),
  transaction: (...args: unknown[]) => mocks.transaction(...args)
}))

const { recomputeHealthIfCustomer } = await import('~~/server/utils/crm/healthSignals')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queryRows.mockResolvedValue([])
  mocks.queryOne.mockResolvedValue({ lifecycle_stage: 'customer' })
})

describe('in-band CRM health authority', () => {
  it('authorizes the current target before reading lifecycle state after an ownership flip', async () => {
    let lifecycleRead = false
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (/SELECT lifecycle_stage/.test(sql)) lifecycleRead = true
      return { lifecycle_stage: 'customer' }
    })

    await recomputeHealthIfCustomer(CLIENT_ID, 'person', TARGET_ID, 'activity', ownerContext)

    expect(lifecycleRead).toBe(false)
  })
})
