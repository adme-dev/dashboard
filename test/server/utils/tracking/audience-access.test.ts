import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mockRequireAuth = vi.fn()
const mockRequireRole = vi.fn()
const mockQuery = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: vi.fn()
}))

const { requireTrackingAudienceScope } = await import(
  '../../../../server/utils/tracking/analytics-access'
)

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const CLIENT_B = '22222222-2222-4222-8222-222222222222'
const CLIENT_C = '33333333-3333-4333-8333-333333333333'
const event = {} as Parameters<typeof requireTrackingAudienceScope>[0]

beforeEach(() => {
  mockRequireAuth.mockReset()
  mockRequireRole.mockReset().mockResolvedValue(undefined)
  mockQuery.mockReset()
})

describe('requireTrackingAudienceScope', () => {
  it('grants management agency scope without querying assignments', async () => {
    const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'owner' }
    mockRequireAuth.mockResolvedValue(user)

    await expect(requireTrackingAudienceScope(event)).resolves.toEqual({
      user,
      accessibleClientIds: null,
      clientIds: null
    })
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('narrows management scope to a requested canonical client id', async () => {
    const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin' }
    mockRequireAuth.mockResolvedValue(user)

    await expect(requireTrackingAudienceScope(event, CLIENT_A)).resolves.toEqual({
      user,
      accessibleClientIds: null,
      clientIds: [CLIENT_A]
    })
  })

  it('returns all assignments as both accessible and query scope for a scoped agency view', async () => {
    const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'media_buyer' }
    mockRequireAuth.mockResolvedValue(user)
    mockQuery.mockResolvedValue([{ client_id: CLIENT_A }, { client_id: CLIENT_C }])

    await expect(requireTrackingAudienceScope(event)).resolves.toEqual({
      user,
      accessibleClientIds: [CLIENT_A, CLIENT_C],
      clientIds: [CLIENT_A, CLIENT_C]
    })
  })

  it('preserves the full accessible option scope while narrowing the data query', async () => {
    const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'account_manager' }
    mockRequireAuth.mockResolvedValue(user)
    mockQuery.mockResolvedValue([{ client_id: CLIENT_A }, { client_id: CLIENT_C }])

    await expect(requireTrackingAudienceScope(event, CLIENT_A)).resolves.toEqual({
      user,
      accessibleClientIds: [CLIENT_A, CLIENT_C],
      clientIds: [CLIENT_A]
    })
  })

  it('rejects a requested client outside a scoped user assignment set', async () => {
    mockRequireAuth.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      role: 'media_buyer'
    })
    mockQuery.mockResolvedValue([{ client_id: CLIENT_A }])

    await expect(requireTrackingAudienceScope(event, CLIENT_B)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'No access to this client'
    })
  })

  it('keeps empty scoped assignments fail-closed instead of treating them as management', async () => {
    const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'media_buyer' }
    mockRequireAuth.mockResolvedValue(user)
    mockQuery.mockResolvedValue([])

    await expect(requireTrackingAudienceScope(event)).resolves.toEqual({
      user,
      accessibleClientIds: [],
      clientIds: []
    })
  })

  it('rejects malformed requested ids before querying assignments', async () => {
    mockRequireAuth.mockResolvedValue({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      role: 'media_buyer'
    })

    await expect(requireTrackingAudienceScope(event, 'not-a-uuid')).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid clientId'
    })
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
