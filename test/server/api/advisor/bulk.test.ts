/**
 * Slice 5: tests for POST /api/advisor/recommendations/bulk.
 *
 * Mocks transaction() so the callback runs immediately with a fake
 * client whose .query records call args.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockClientQuery = vi.fn()
const mockTransaction = vi.fn(async (cb: any) => cb({ query: mockClientQuery }))
const mockGetSelectedTenant = vi.fn(async () => 'tenant-123')
const mockRequireAuth = vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-123' }))
const mockRequireWriteAccess = vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-123' }))

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: any[]) => mockTransaction(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: any[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: any[]) => mockRequireWriteAccess(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).readBody = (event: any) => Promise.resolve(event?.body ?? {})
;(globalThis as any).createError = (opts: { statusCode: number; statusMessage: string }) => {
  const e = new Error(opts.statusMessage) as any
  e.statusCode = opts.statusCode
  e.statusMessage = opts.statusMessage
  return e
}

vi.mock('h3', () => ({
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    const e = new Error(opts.statusMessage) as any
    e.statusCode = opts.statusCode
    e.statusMessage = opts.statusMessage
    return e
  },
}))

const { default: handler } = await import(
  '../../../../server/api/advisor/recommendations/bulk.post'
)

// Zod uses RFC 4122 UUID validation — version digit (13th hex) must be
// 1-8 and the variant digit (17th hex) must be 8/9/a/b. Hand-build a v4
// shape so tests don't drag in a uuid lib.
const UUID = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

describe('POST /api/advisor/recommendations/bulk', () => {
  beforeEach(() => {
    mockClientQuery.mockReset()
    mockTransaction.mockClear()
    // Default: UPDATE returns 2 ids, INSERT events succeeds.
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.startsWith('UPDATE')) {
        return Promise.resolve({ rows: [{ id: UUID('1') }, { id: UUID('2') }] })
      }
      return Promise.resolve({ rows: [] })
    })
  })

  it('applies patch to ids and reports updated count', async () => {
    const res = await handler({
      body: {
        ids: [UUID('1'), UUID('2')],
        patch: { priority: 'high' },
      },
    } as any)
    expect(res.updated).toBe(2)
    expect(res.requested).toBe(2)
    const updateCall = mockClientQuery.mock.calls.find((c) => c[0].startsWith('UPDATE'))
    expect(updateCall).toBeTruthy()
    expect(updateCall![0]).toMatch(/priority = \$\d+/)
    expect(updateCall![0]).toMatch(/tenant_id = \$\d+/)
  })

  it('rejects empty ids array with 400', async () => {
    await expect(
      handler({ body: { ids: [], patch: { priority: 'high' } } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects oversized ids array (201 entries) with 400', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => UUID(String(i + 1)))
    await expect(
      handler({ body: { ids, patch: { priority: 'high' } } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects empty patch object with 400 (no updatable fields)', async () => {
    await expect(
      handler({ body: { ids: [UUID('1')], patch: {} } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('treats explicit null in patch as clear-field', async () => {
    await handler({
      body: { ids: [UUID('1')], patch: { assigned_to: null } },
    } as any)
    const updateCall = mockClientQuery.mock.calls.find((c) => c[0].startsWith('UPDATE'))
    expect(updateCall![0]).toMatch(/assigned_to = \$\d+/)
    expect(updateCall![1]).toContain(null)
  })

  it('rejects invalid uuid in ids with 400', async () => {
    await expect(
      handler({ body: { ids: ['not-a-uuid'], patch: { priority: 'high' } } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects unknown category with 400', async () => {
    await expect(
      handler({
        body: { ids: [UUID('1')], patch: { category: 'not-a-category' } },
      } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('emits one bulk_updated event per affected row', async () => {
    await handler({
      body: { ids: [UUID('1'), UUID('2')], patch: { priority: 'high' } },
    } as any)
    const insertCall = mockClientQuery.mock.calls.find((c) =>
      c[0].includes('INSERT INTO recommendation_events')
    )
    expect(insertCall).toBeTruthy()
    expect(insertCall![0]).toMatch(/'bulk_updated'/)
    // Two value tuples → two ($1, $2, $3) groups → 6 params (id, actor, payload × 2).
    expect(insertCall![1]).toHaveLength(6)
  })

  it('scopes the UPDATE to the tenant', async () => {
    await handler({
      body: { ids: [UUID('1')], patch: { priority: 'high' } },
    } as any)
    const updateCall = mockClientQuery.mock.calls.find((c) => c[0].startsWith('UPDATE'))
    // Last two params are the ids array + the tenantId.
    const params = updateCall![1]
    expect(params[params.length - 1]).toBe('tenant-123')
  })

  it('stamps acted_at when status moves to done', async () => {
    await handler({
      body: { ids: [UUID('1')], patch: { status: 'done' } },
    } as any)
    const updateCall = mockClientQuery.mock.calls.find((c) => c[0].startsWith('UPDATE'))
    expect(updateCall![0]).toMatch(/acted_at = COALESCE\(acted_at, NOW\(\)\)/)
  })

  it('clears acted_at when status moves back to open', async () => {
    await handler({
      body: { ids: [UUID('1')], patch: { status: 'open' } },
    } as any)
    const updateCall = mockClientQuery.mock.calls.find((c) => c[0].startsWith('UPDATE'))
    expect(updateCall![0]).toMatch(/acted_at = NULL/)
  })
})
