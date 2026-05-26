import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = Record<string, never>

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(fn: T) => T
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.eventHandler = fn => fn
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireRole = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/admin/sidebar/badge-counts.get'
)

describe('GET /api/admin/sidebar/badge-counts', () => {
  beforeEach(() => {
    mockRequireRole.mockReset()
    mockQueryOne.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'user-1', role: 'admin' })
  })

  it('returns admin sidebar badge counts', async () => {
    mockQueryOne.mockResolvedValueOnce({
      users: '12',
      teams: 4,
      roles: null
    })

    const result = await handler({} satisfies TestEvent)

    expect(mockRequireRole).toHaveBeenCalledWith({}, ['admin', 'owner'])
    expect(result).toEqual({
      counts: {
        users: 12,
        teams: 4,
        roles: 0
      }
    })
    const sql = String(mockQueryOne.mock.calls[0]?.[0])
    expect(sql).toContain('team_members')
    expect(sql).toContain('teams')
    expect(sql).toContain('custom_roles')
  })
})
