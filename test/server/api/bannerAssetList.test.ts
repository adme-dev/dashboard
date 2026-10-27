import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
vi.stubGlobal('setHeader', vi.fn())

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: (...args: unknown[]) => mockQueryRows(...args)
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  hasAllSocialClientAccess: () => false,
  hasSocialClientPermission: () => true,
  requireSocialClientAccess: vi.fn()
}))

const { default: handler } = await import(
  '../../../../server/api/agency/banner-studio/assets/index.get'
)

describe('GET /api/agency/banner-studio/assets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryRows.mockResolvedValue([{ id: 'asset-1', name: 'Leap-Motor.jpg' }])
  })

  it('returns the asset wrapper expected by every picker', async () => {
    await expect(handler({ query: {} })).resolves.toEqual({
      assets: [expect.objectContaining({ id: 'asset-1' })]
    })
  })
  it('excludes private dissection and export namespaces before pagination', async () => {
    await handler({ query: { limit: '10', offset: '20' } })
    const sql = mockQueryRows.mock.calls[0][0] as string
    expect(sql).toContain("r2_key NOT LIKE 'scoped-dissection-assets/%'")
    expect(sql).toContain("r2_key NOT LIKE 'scoped-banner-exports/%'")
    expect(sql).toContain("url NOT LIKE '/api/agency/banner-studio/dissect/%'")
    expect(sql.indexOf("r2_key NOT LIKE")).toBeLessThan(sql.indexOf('LIMIT'))
  })

})
