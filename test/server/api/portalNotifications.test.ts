import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
  params?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

const { default: listNotificationsHandler } = await import(
  '../../../../server/api/portal/notifications/index.get'
)
const { default: markNotificationReadHandler } = await import(
  '../../../../server/api/portal/notifications/[id]/read.post'
)

describe('portal notifications API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue({ id: 'client-user-1', clientId: 'client-1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({ count: '3' })
    mockExecute.mockResolvedValue({ rowCount: 1 })
  })

  it('can filter unread notifications for client triage', async () => {
    const result = await listNotificationsHandler({ query: { unreadOnly: 'true', limit: '10' } })

    expect(result.unreadCount).toBe(3)
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('cn.is_read = false'),
      ['client-user-1', 10]
    )
  })

  it('marks all unread client notifications as read in one request', async () => {
    const result = await markNotificationReadHandler({ params: { id: 'all' } })

    expect(result).toEqual({ success: true })
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('is_read = false AND is_archived = false'),
      ['client-user-1']
    )
  })

  it('scopes single notification read updates to the current client user', async () => {
    await markNotificationReadHandler({ params: { id: 'notification-1' } })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND client_user_id = $2'),
      ['notification-1', 'client-user-1']
    )
  })
})
