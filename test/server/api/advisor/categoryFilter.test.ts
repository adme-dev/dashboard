/**
 * Unit tests for the category filter logic on the recommendations
 * index endpoint. Mocks the db layer; verifies the SQL fragment and
 * params we'd pass to queryRows for each filter shape.
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

// Nuxt auto-imports — mock as globals so the handler can call them.
;(globalThis as any).getQuery = (event: any) => event?.query ?? {}
;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).createError = (opts: { statusCode: number; statusMessage: string }) => {
  const e = new Error(opts.statusMessage) as any
  e.statusCode = opts.statusCode
  e.statusMessage = opts.statusMessage
  return e
}

// Also satisfy the `import { createError } from 'h3'` form.
vi.mock('h3', () => ({
  createError: (opts: { statusCode: number; statusMessage: string }) => {
    const e = new Error(opts.statusMessage) as any
    e.statusCode = opts.statusCode
    e.statusMessage = opts.statusMessage
    return e
  },
}))

const { default: handler } = await import('../../../../server/api/advisor/recommendations/index.get')

describe('GET /api/advisor/recommendations — category filter', () => {
  beforeEach(() => {
    mockQueryRows.mockReset()
    mockQueryRows.mockResolvedValue([])
  })

  it('passes a literal category value through to the WHERE clause', async () => {
    await handler({ query: { category: 'cashflow' } } as any)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(sql).toMatch(/r\.category = \$\d+/)
    expect(params).toContain('cashflow')
  })

  it('translates ?category=none into IS NULL', async () => {
    await handler({ query: { category: 'none' } } as any)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(sql).toMatch(/r\.category IS NULL/)
    expect(params).not.toContain('none')
  })

  it('rejects an unknown category value with 400', async () => {
    await expect(
      handler({ query: { category: 'bogus' } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('omits the category clause entirely when no filter passed', async () => {
    await handler({ query: {} } as any)
    const [sql] = mockQueryRows.mock.calls[0]
    // r.category appears in the SELECT list (return value); the test
    // is that the WHERE clause has no category filter on it.
    const whereClause = sql.split(/\bWHERE\b/i)[1]?.split(/\bORDER BY\b/i)[0] ?? ''
    expect(whereClause).not.toMatch(/r\.category/)
  })
})
