import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = Record<string, never>

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(fn: T) => T
  getRouterParam: (event: unknown, name: string) => string | undefined
  readBody: <T>(event: unknown) => Promise<T>
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

const mockRequireAuth = vi.fn()
const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockGetRouterParam = vi.fn()
const mockReadBody = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

testGlobal.getRouterParam = (...args: unknown[]) => mockGetRouterParam(...args)
testGlobal.readBody = (...args: unknown[]) => mockReadBody(...args)

const { default: getUsersHandler } = await import(
  '../../../../server/api/admin/users/index.get'
)
const { default: updateUserHandler } = await import(
  '../../../../server/api/admin/users/[id].patch'
)

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockQueryOne.mockReset()
    mockGetRouterParam.mockReset()
    mockReadBody.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'owner-1', role: 'owner' })
    mockRequireRole.mockResolvedValue({ id: 'owner-1', role: 'owner' })
  })

  it('returns all active users for an owner', async () => {
    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'owner-1',
          name: 'Owner User',
          email: 'owner@example.com',
          avatar_url: null,
          role: 'owner',
          title: null,
          is_active: true,
          monday_user_id: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z'
        },
        {
          id: 'member-1',
          name: 'Member User',
          email: 'member@example.com',
          avatar_url: null,
          role: 'member',
          title: 'Designer',
          is_active: true,
          monday_user_id: null,
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z'
        },
        {
          id: 'finance-1',
          name: 'Finance User',
          email: 'finance@example.com',
          avatar_url: null,
          role: 'finance',
          title: 'Bookkeeper',
          is_active: true,
          monday_user_id: null,
          created_at: '2026-01-03T00:00:00.000Z',
          updated_at: '2026-01-03T00:00:00.000Z'
        }
      ])
      .mockResolvedValueOnce([
        { user_id: 'member-1', team_id: 'team-1', team_name: 'Studio' }
      ])

    const result = await getUsersHandler({} satisfies TestEvent)

    expect(mockRequireRole).toHaveBeenCalledWith({}, ['admin', 'owner'])
    expect(result.users.map((user: { id: string }) => user.id)).toEqual([
      'owner-1',
      'member-1',
      'finance-1'
    ])
    expect(result.users.find((user: { id: string }) => user.id === 'member-1')?.teams).toEqual([
      { id: 'team-1', name: 'Studio' }
    ])
  })
})

describe('PATCH /api/admin/users/:id', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockRequireRole.mockReset()
    mockQueryRows.mockReset()
    mockQueryOne.mockReset()
    mockGetRouterParam.mockReset()
    mockReadBody.mockReset()
    mockRequireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    mockGetRouterParam.mockReturnValue('user-1')
  })

  it('updates profile details for admin and owner users', async () => {
    mockReadBody.mockResolvedValue({ name: 'Updated User', email: 'updated@example.com' })
    mockQueryOne.mockResolvedValue({
      id: 'user-1',
      name: 'Updated User',
      email: 'updated@example.com',
      role: 'Designer',
      is_active: true,
      updated_at: '2026-01-04T00:00:00.000Z'
    })

    const result = await updateUserHandler({} satisfies TestEvent)

    expect(mockRequireRole).toHaveBeenCalledWith({}, ['admin', 'owner'])
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE team_members'),
      ['Updated User', 'updated@example.com', 'user-1']
    )
    expect(result).toEqual({
      success: true,
      user: {
        id: 'user-1',
        name: 'Updated User',
        email: 'updated@example.com',
        role: 'Designer',
        is_active: true,
        updated_at: '2026-01-04T00:00:00.000Z'
      }
    })
  })

  it('rejects role and status changes because those have dedicated guarded endpoints', async () => {
    mockReadBody.mockResolvedValue({ role: 'owner' })

    await expect(updateUserHandler({} satisfies TestEvent)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Use /api/auth/users/:id/role to change roles'
    })

    mockReadBody.mockResolvedValue({ isActive: false })

    await expect(updateUserHandler({} satisfies TestEvent)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Use /api/auth/users/:id/status to change user status'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
