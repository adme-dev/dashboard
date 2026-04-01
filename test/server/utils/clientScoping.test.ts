/**
 * Client Scoping Tests
 *
 * Tests the invoice access resolution pipeline:
 * - getAssignedClientIds: KV cache → DB lookup → cache write
 * - resolveInvoiceAccess: finance roles get 'all', account_manager gets scoped IDs, others get 403
 * - invalidateAssignmentCache: deletes KV cache key
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock database
const mockQueryRows = vi.fn()

vi.mock('../../../server/utils/db', () => ({
  queryRows: (...args: any[]) => mockQueryRows(...args)
}))

// Mock KV
const mockKvGet = vi.fn()
const mockKvPut = vi.fn()
const mockKvDelete = vi.fn()

vi.mock('../../../server/utils/kv', () => ({
  kvGet: (...args: any[]) => mockKvGet(...args),
  kvPut: (...args: any[]) => mockKvPut(...args),
  kvDelete: (...args: any[]) => mockKvDelete(...args)
}))

// Import after mocks
import { getAssignedClientIds, resolveInvoiceAccess, invalidateAssignmentCache } from '../../../server/utils/clientScoping'

// Fake H3Event
const fakeEvent = {} as any

function makeUser(overrides: Partial<{ id: string; role: string; permissionGroups: string[] }> = {}) {
  return {
    id: overrides.id ?? 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: overrides.role ?? 'account_manager',
    is_active: true,
    permissionGroups: overrides.permissionGroups,
  }
}

describe('getAssignedClientIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns IDs from DB when KV cache misses', async () => {
    mockKvGet.mockResolvedValue(null)
    mockQueryRows.mockResolvedValue([
      { client_id: 'client-1' },
      { client_id: 'client-2' },
    ])

    const ids = await getAssignedClientIds(fakeEvent, 'user-1')

    expect(ids).toEqual(['client-1', 'client-2'])
    expect(mockQueryRows).toHaveBeenCalledOnce()
    expect(mockQueryRows).toHaveBeenCalledWith(
      'SELECT client_id FROM client_team_assignments WHERE team_member_id = $1',
      ['user-1']
    )
    // Should write to cache
    expect(mockKvPut).toHaveBeenCalledWith(
      fakeEvent,
      'client-assignments:user-1',
      ['client-1', 'client-2'],
      300
    )
  })

  it('returns cached IDs from KV without hitting DB', async () => {
    mockKvGet.mockResolvedValue(['client-3', 'client-4'])

    const ids = await getAssignedClientIds(fakeEvent, 'user-2')

    expect(ids).toEqual(['client-3', 'client-4'])
    expect(mockQueryRows).not.toHaveBeenCalled()
    expect(mockKvPut).not.toHaveBeenCalled()
  })

  it('returns empty array when no assignments exist', async () => {
    mockKvGet.mockResolvedValue(null)
    mockQueryRows.mockResolvedValue([])

    const ids = await getAssignedClientIds(fakeEvent, 'user-3')

    expect(ids).toEqual([])
    expect(mockKvPut).toHaveBeenCalledWith(
      fakeEvent,
      'client-assignments:user-3',
      [],
      300
    )
  })
})

describe('resolveInvoiceAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns "all" for finance role (e.g. finance)', async () => {
    const user = makeUser({ role: 'finance' })
    const result = await resolveInvoiceAccess(fakeEvent, user)
    expect(result).toBe('all')
  })

  it('returns "all" for owner', async () => {
    const user = makeUser({ role: 'owner' })
    const result = await resolveInvoiceAccess(fakeEvent, user)
    expect(result).toBe('all')
  })

  it('returns "all" for admin', async () => {
    const user = makeUser({ role: 'admin' })
    const result = await resolveInvoiceAccess(fakeEvent, user)
    expect(result).toBe('all')
  })

  it('returns "all" for user with FINANCE permission group', async () => {
    const user = makeUser({ role: 'member', permissionGroups: ['FINANCE'] })
    const result = await resolveInvoiceAccess(fakeEvent, user)
    expect(result).toBe('all')
  })

  it('returns client ID array for account_manager', async () => {
    mockKvGet.mockResolvedValue(null)
    mockQueryRows.mockResolvedValue([
      { client_id: 'client-10' },
      { client_id: 'client-20' },
    ])

    const user = makeUser({ id: 'am-1', role: 'account_manager' })
    const result = await resolveInvoiceAccess(fakeEvent, user)

    expect(result).toEqual(['client-10', 'client-20'])
  })

  it('returns client IDs for user with INVOICE_OWN_CLIENTS permission group', async () => {
    mockKvGet.mockResolvedValue(['client-99'])

    const user = makeUser({ id: 'custom-1', role: 'member', permissionGroups: ['INVOICE_OWN_CLIENTS'] })
    const result = await resolveInvoiceAccess(fakeEvent, user)

    expect(result).toEqual(['client-99'])
  })

  it('throws 403 for roles without invoice access', async () => {
    const user = makeUser({ role: 'viewer' })

    await expect(resolveInvoiceAccess(fakeEvent, user)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'No invoice access',
    })
  })

  it('throws 403 for guest role', async () => {
    const user = makeUser({ role: 'guest' })

    await expect(resolveInvoiceAccess(fakeEvent, user)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'No invoice access',
    })
  })
})

describe('invalidateAssignmentCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the correct KV key', () => {
    invalidateAssignmentCache(fakeEvent, 'user-5')

    expect(mockKvDelete).toHaveBeenCalledWith(
      fakeEvent,
      'client-assignments:user-5'
    )
  })
})
