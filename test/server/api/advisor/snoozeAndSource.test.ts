/**
 * Slice 2: snooze visibility + source filter tests for the
 * recommendations index endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryRows = vi.fn()
const mockGetSelectedTenant = vi.fn(async () => 'tenant-123')
const mockRequireAuth = vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-123' }))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: any[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: any[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
}))

;(globalThis as any).getQuery = (event: any) => event?.query ?? {}
;(globalThis as any).eventHandler = (fn: any) => fn
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

const { default: handler } = await import('../../../../server/api/advisor/recommendations/index.get')

function whereClause(sql: string): string {
  return sql.split(/\bWHERE\b/i)[1]?.split(/\bORDER BY\b/i)[0] ?? ''
}

describe('GET /api/advisor/recommendations — snooze visibility', () => {
  beforeEach(() => {
    mockQueryRows.mockReset()
    mockQueryRows.mockResolvedValue([])
  })

  it('hides future-snoozed rows by default in active view', async () => {
    await handler({ query: {} } as any)
    const where = whereClause(mockQueryRows.mock.calls[0][0])
    expect(where).toMatch(/r\.snoozed_until IS NULL OR r\.snoozed_until <= CURRENT_DATE/)
  })

  it('hides future-snoozed rows when status=open,in_progress', async () => {
    await handler({ query: { status: 'open,in_progress' } } as any)
    const where = whereClause(mockQueryRows.mock.calls[0][0])
    expect(where).toMatch(/r\.snoozed_until IS NULL OR r\.snoozed_until <= CURRENT_DATE/)
  })

  it('shows snoozed rows when ?include_snoozed=1', async () => {
    await handler({ query: { include_snoozed: '1' } } as any)
    const where = whereClause(mockQueryRows.mock.calls[0][0])
    expect(where).not.toMatch(/snoozed_until/)
  })

  it('does not apply snooze filter for closed-status views', async () => {
    await handler({ query: { status: 'done' } } as any)
    const where = whereClause(mockQueryRows.mock.calls[0][0])
    expect(where).not.toMatch(/snoozed_until/)
  })

  it('does not apply snooze filter when status mixes active + closed', async () => {
    // status=open,done is no longer "exclusively active" — show everything.
    await handler({ query: { status: 'open,done' } } as any)
    const where = whereClause(mockQueryRows.mock.calls[0][0])
    expect(where).not.toMatch(/snoozed_until/)
  })
})

describe('GET /api/advisor/recommendations — source filter', () => {
  beforeEach(() => {
    mockQueryRows.mockReset()
    mockQueryRows.mockResolvedValue([])
  })

  it('filters by ?source=ai', async () => {
    await handler({ query: { source: 'ai' } } as any)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(whereClause(sql)).toMatch(/r\.source = \$\d+/)
    expect(params).toContain('ai')
  })

  it('filters by ?source=manual', async () => {
    await handler({ query: { source: 'manual' } } as any)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(whereClause(sql)).toMatch(/r\.source = \$\d+/)
    expect(params).toContain('manual')
  })

  it('rejects unknown source values with 400', async () => {
    await expect(
      handler({ query: { source: 'bogus' } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('omits the source clause when no filter passed', async () => {
    await handler({ query: {} } as any)
    const where = whereClause(mockQueryRows.mock.calls[0][0])
    expect(where).not.toMatch(/r\.source/)
  })
})
