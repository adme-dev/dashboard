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

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
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
})
