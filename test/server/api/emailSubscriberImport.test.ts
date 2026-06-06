import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadBody = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetAssignedClientIds = vi.fn()
const mockQueryRows = vi.fn()
const mockGetList = vi.fn()
const mockUpsertSubscriber = vi.fn()
const mockAddToList = vi.fn()

const LIST_1 = '11111111-1111-4111-8111-111111111111'
const CLIENT_1 = '22222222-2222-4222-8222-222222222222'
const CLIENT_2 = '33333333-3333-4333-8333-333333333333'

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  readBody: typeof mockReadBody
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.readBody = mockReadBody

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/clientScoping', () => ({
  getAssignedClientIds: (...args: unknown[]) => mockGetAssignedClientIds(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

vi.mock('~~/server/utils/email-marketing/db', () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  upsertSubscriber: (...args: unknown[]) => mockUpsertSubscriber(...args),
  addToList: (...args: unknown[]) => mockAddToList(...args)
}))

describe('email subscriber import route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'admin' })
    mockGetAssignedClientIds.mockResolvedValue([CLIENT_1])
    mockGetList.mockResolvedValue({ id: LIST_1, client_id: null })
    mockQueryRows.mockResolvedValue([])
    mockUpsertSubscriber
      .mockResolvedValueOnce('sub-a')
      .mockResolvedValueOnce('sub-b')
    mockAddToList.mockResolvedValue(undefined)
  })

  it('returns an import review for invalid, duplicate, unsubscribed, suppressed, and blocklisted rows', async () => {
    const handler = (await import('~~/server/api/email/subscribers/import.post')).default
    mockReadBody.mockResolvedValue({
      list_id: LIST_1,
      csv: [
        'email,name',
        'bad-email,Bad',
        'a@example.com,Alice',
        'b@example.com,Bob',
        'B@example.com,Duplicate'
      ].join('\n')
    })
    mockQueryRows.mockResolvedValueOnce([
      {
        email: 'a@example.com',
        subscriber_status: 'enabled',
        membership_status: 'unsubscribed',
        suppression_reason: null
      },
      {
        email: 'b@example.com',
        subscriber_status: 'blocklisted',
        membership_status: 'confirmed',
        suppression_reason: 'hard_bounce'
      }
    ])

    const result = await handler({} as never)

    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('FROM email_subscribers s'),
      [
        ['a@example.com', 'b@example.com'],
        LIST_1
      ]
    )
    expect(result).toEqual(expect.objectContaining({
      imported: 2,
      skipped: 2,
      review: {
        valid_rows: 2,
        invalid_rows: 1,
        duplicate_rows: 1,
        previously_unsubscribed: 1,
        suppressed: 1,
        blocklisted: 1
      }
    }))
  })

  it('blocks scoped users from importing into agency-wide lists', async () => {
    const handler = (await import('~~/server/api/email/subscribers/import.post')).default
    mockRequireWriteAccess.mockResolvedValueOnce({
      id: 'user-1',
      role: 'account_manager',
      permissionGroups: []
    })
    mockGetList.mockResolvedValueOnce({ id: LIST_1, client_id: null })
    mockReadBody.mockResolvedValue({
      list_id: LIST_1,
      csv: ['email,name', 'a@example.com,Alice'].join('\n')
    })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_client_scope_required'
    })

    expect(mockUpsertSubscriber).not.toHaveBeenCalled()
    expect(mockAddToList).not.toHaveBeenCalled()
  })

  it('blocks scoped imports from attaching another client existing subscriber', async () => {
    const handler = (await import('~~/server/api/email/subscribers/import.post')).default
    mockRequireWriteAccess.mockResolvedValueOnce({
      id: 'user-1',
      role: 'account_manager',
      permissionGroups: []
    })
    mockGetList.mockResolvedValueOnce({ id: LIST_1, client_id: CLIENT_1 })
    mockReadBody.mockResolvedValue({
      list_id: LIST_1,
      csv: ['email,name', 'existing@example.com,Existing'].join('\n')
    })
    mockQueryRows.mockResolvedValueOnce([
      {
        email: 'existing@example.com',
        client_id: CLIENT_2,
        subscriber_status: 'enabled',
        membership_status: null,
        suppression_reason: null
      }
    ])

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_list_client_mismatch'
    })
    expect(mockUpsertSubscriber).not.toHaveBeenCalled()
    expect(mockAddToList).not.toHaveBeenCalled()
  })
})
