import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: profileHandler } = await import(
  '../../../../server/api/portal/profile.put'
)

describe('portal profile API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({
      id: 'client-user-1',
      clientId: 'client-1',
      agencyAccess: false
    })
    mockQueryOne.mockResolvedValue({
      id: 'client-user-1',
      email: 'client@example.com',
      name: 'Jane Client',
      title: 'Marketing Manager',
      phone: '+61 400 000 000',
      timezone: 'Australia/Melbourne',
      updated_at: '2026-05-27T03:00:00Z'
    })
  })

  it('updates the current client user profile within their client scope', async () => {
    const result = await profileHandler({
      body: {
        name: ' Jane Client ',
        title: 'Marketing Manager',
        phone: '+61 400 000 000',
        timezone: 'Australia/Melbourne'
      }
    })

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $5'),
      [
        'Jane Client',
        'Marketing Manager',
        '+61 400 000 000',
        'Australia/Melbourne',
        'client-user-1',
        'client-1'
      ]
    )
    expect(result.user).toMatchObject({
      id: 'client-user-1',
      name: 'Jane Client',
      timezone: 'Australia/Melbourne'
    })
  })

  it('requires a name', async () => {
    await expect(profileHandler({ body: { name: ' ' } })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Name is required'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('rejects profile changes from agency preview sessions', async () => {
    mockRequireClientAuth.mockResolvedValueOnce({
      id: 'agency-proxy-user-1',
      clientId: 'client-1',
      agencyAccess: true
    })

    await expect(profileHandler({
      body: {
        name: 'Agency User',
        timezone: 'Australia/Melbourne'
      }
    })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Agency preview profiles are read-only'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
