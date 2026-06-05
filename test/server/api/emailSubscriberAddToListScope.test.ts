import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENT_1 = '11111111-1111-4111-8111-111111111111'
const CLIENT_2 = '22222222-2222-4222-8222-222222222222'
const LIST_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUB_1 = '33333333-3333-4333-8333-333333333333'
const LEAD_1 = '44444444-4444-4444-8444-444444444444'

const mockReadBody = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetAssignedClientIds = vi.fn()
const mockQueryRows = vi.fn()
const mockGetList = vi.fn()
const mockUpsertSubscriber = vi.fn()
const mockAddToList = vi.fn()

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

describe('email subscriber add-to-list client scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({
      id: 'user-1',
      email: 'am@example.com',
      name: 'Account Manager',
      role: 'account_manager',
      is_active: true
    })
    mockGetAssignedClientIds.mockResolvedValue([CLIENT_1])
    mockGetList.mockResolvedValue({ id: LIST_1, client_id: CLIENT_1 })
    mockReadBody.mockResolvedValue({
      list_id: LIST_1,
      subscriber_ids: [SUB_1],
      lead_ids: [LEAD_1]
    })
    mockQueryRows
      .mockResolvedValueOnce([{ id: SUB_1, client_id: CLIENT_1 }])
      .mockResolvedValueOnce([{
        id: LEAD_1,
        client_id: CLIENT_2,
        field_data: { email: 'lead@example.com' }
      }])
    mockUpsertSubscriber.mockResolvedValue('sub-new')
    mockAddToList.mockResolvedValue(undefined)
  })

  it('does not partially add existing subscribers before rejecting mismatched leads', async () => {
    const handler = (await import('~~/server/api/email/subscribers/add-to-list.post')).default

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_list_client_mismatch'
    })

    expect(mockAddToList).not.toHaveBeenCalled()
    expect(mockUpsertSubscriber).not.toHaveBeenCalled()
  })
})
