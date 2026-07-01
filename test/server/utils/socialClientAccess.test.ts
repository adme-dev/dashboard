import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const {
  hasAllSocialClientAccess,
  hasSocialClientPermission,
  requireSocialClientAccess
} = await import('../../../server/utils/social/clientAccess')

const validClientId = '11111111-1111-4111-8111-111111111111'
const testEvent = {} as Parameters<typeof requireSocialClientAccess>[0]

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({
    id: 'user-1',
    role: 'account_manager',
    permissionGroups: ['CLIENTS']
  })
  mockQueryOne.mockResolvedValue({ '?column?': 1 })
})

describe('social client access', () => {
  it('recognizes legacy and custom social permissions', () => {
    expect(hasSocialClientPermission({ role: 'creative' })).toBe(true)
    expect(hasSocialClientPermission({ role: 'developer', permissionGroups: ['MEDIA_BUYING'] })).toBe(true)
    expect(hasSocialClientPermission({ role: 'viewer' })).toBe(false)
  })

  it('treats management and admin permissions as all-client social access', () => {
    expect(hasAllSocialClientAccess({ role: 'project_manager' })).toBe(true)
    expect(hasAllSocialClientAccess({ role: 'developer', permissionGroups: ['ADMIN'] })).toBe(true)
    expect(hasAllSocialClientAccess({ role: 'account_manager', permissionGroups: ['CLIENTS'] })).toBe(false)
  })

  it('allows all-client users without an assignment lookup', async () => {
    mockRequireAuth.mockResolvedValueOnce({ id: 'user-1', role: 'owner' })

    await expect(requireSocialClientAccess(testEvent, validClientId)).resolves.toMatchObject({ role: 'owner' })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('allows scoped users assigned to the requested client', async () => {
    await expect(requireSocialClientAccess(testEvent, validClientId)).resolves.toMatchObject({
      id: 'user-1',
      role: 'account_manager'
    })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('client_team_assignments'),
      [validClientId, 'user-1']
    )
  })

  it('rejects social users who are not assigned to the requested client', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(requireSocialClientAccess(testEvent, validClientId)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'No access to this client'
    })
  })

  it('rejects users without a social client permission', async () => {
    mockRequireAuth.mockResolvedValueOnce({ id: 'user-1', role: 'viewer' })

    await expect(requireSocialClientAccess(testEvent, validClientId)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden - Insufficient permissions'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('rejects malformed client ids before querying assignments', async () => {
    await expect(requireSocialClientAccess(testEvent, 'client-1')).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid clientId'
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
