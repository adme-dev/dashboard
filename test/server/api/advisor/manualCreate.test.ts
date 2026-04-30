/**
 * Slice 3: tests for POST /api/advisor/recommendations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockGetSelectedTenant = vi.fn(async () => 'tenant-123')
const mockRequireAuth = vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-123' }))
const mockRequireWriteAccess = vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-123' }))
const mockEmbed = vi.fn(async () => null)

vi.mock('~~/server/utils/db', () => ({
  query: (...args: any[]) => mockQuery(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: any[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: any[]) => mockRequireWriteAccess(...args),
}))

vi.mock('~~/server/utils/advisorEmbedder', () => ({
  embedRecommendation: (...args: any[]) => mockEmbed(...args),
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

const { default: handler } = await import('../../../../server/api/advisor/recommendations/index.post')

const FIXTURE_ROW = {
  id: 'rec-1',
  tenant_id: 'tenant-123',
  client_id: null,
  title: 'Watch top-3 client share',
  action: 'Run a concentration analysis next sprint',
  impact: null,
  priority: 'medium',
  source: 'manual',
  created_by: 'user-1',
}

describe('POST /api/advisor/recommendations', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockEmbed.mockReset()
    mockEmbed.mockResolvedValue(null)
    // First call = INSERT recommendations, second = INSERT event.
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO recommendations')) {
        return Promise.resolve([FIXTURE_ROW])
      }
      return Promise.resolve([])
    })
  })

  it('inserts a manual rec with source=manual and created_by set', async () => {
    const res = await handler({
      body: {
        title: 'Watch top-3 client share',
        action: 'Run a concentration analysis next sprint',
      },
    } as any)
    expect(res.recommendation.id).toBe('rec-1')
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes('INSERT INTO recommendations'))
    expect(insertCall).toBeTruthy()
    const params = insertCall![1]
    // Find the value 'user-1' for created_by — last param.
    expect(params).toContain('user-1')
    // The literal 'manual' is hard-coded in the SQL string.
    expect(insertCall![0]).toContain("'manual'")
  })

  it('rejects empty title with 400', async () => {
    await expect(
      handler({ body: { title: '   ', action: 'foo' } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects missing action with 400', async () => {
    await expect(
      handler({ body: { title: 'foo' } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects unknown category with 400', async () => {
    await expect(
      handler({ body: { title: 'foo', action: 'bar', category: 'not-a-real-category' } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('emits a created_manual audit event', async () => {
    await handler({ body: { title: 'a', action: 'b' } } as any)
    const eventCall = mockQuery.mock.calls.find((c) =>
      c[0].includes('INSERT INTO recommendation_events')
    )
    expect(eventCall).toBeTruthy()
    expect(eventCall![1]).toContain('rec-1')
    expect(eventCall![1]).toContain('user-1')
  })

  it('still succeeds when Vectorize embed throws', async () => {
    mockEmbed.mockRejectedValueOnce(new Error('Vectorize unavailable'))
    const res = await handler({ body: { title: 'a', action: 'b' } } as any)
    expect(res.recommendation.id).toBe('rec-1')
  })

  it('accepts a valid category and passes it through to the INSERT', async () => {
    await handler({
      body: { title: 'a', action: 'b', category: 'cashflow' },
    } as any)
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes('INSERT INTO recommendations'))
    expect(insertCall![1]).toContain('cashflow')
  })

  it('defaults priority to medium when omitted', async () => {
    await handler({ body: { title: 'a', action: 'b' } } as any)
    const insertCall = mockQuery.mock.calls.find((c) => c[0].includes('INSERT INTO recommendations'))
    expect(insertCall![1]).toContain('medium')
  })
})
