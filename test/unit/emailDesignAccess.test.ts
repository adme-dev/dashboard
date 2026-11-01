import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertFreshDesignAccess } from '../../server/utils/email-marketing/designAccess'

const mocks = vi.hoisted(() => ({ query: vi.fn(), session: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query }))
vi.mock('~~/server/utils/auth', () => ({ validateSession: mocks.session }))

const actor = '10000000-0000-4000-8000-000000000001'
const client = '20000000-0000-4000-8000-000000000001'
const row = () => ({
  role: 'creative',
  custom_role_id: null,
  configured_role_id: 'role',
  is_read_only: false,
  permission_groups: ['CREATIVE'],
  assigned: true,
  client_active: true
})
describe('fresh email design authority', () => {
  beforeEach(() => {
    mocks.session.mockResolvedValue({ id: actor })
    mocks.query.mockResolvedValue(row())
  })
  it('derives designer authority from current configured permissions', async () => {
    expect(await assertFreshDesignAccess('token', actor, client, 'write')).toBe(
      'designer'
    )
    expect(mocks.session).toHaveBeenCalledWith('token')
  })
  it('keeps assigned ordinary staff content-only', async () => {
    mocks.query.mockResolvedValue({
      ...row(),
      role: 'account_manager',
      permission_groups: ['CLIENTS']
    })
    expect(await assertFreshDesignAccess('token', actor, client, 'write')).toBe(
      'staff'
    )
  })
  it('does not reuse prior session, role or assignment decisions', async () => {
    await assertFreshDesignAccess('token', actor, client, 'write')
    mocks.query.mockResolvedValue({ ...row(), assigned: false })
    await expect(
      assertFreshDesignAccess('token', actor, client, 'write')
    ).rejects.toMatchObject({ statusCode: 403 })
    mocks.session.mockResolvedValue(null)
    await expect(
      assertFreshDesignAccess('token', actor, client, 'read')
    ).rejects.toMatchObject({ statusCode: 401 })
  })
  it.each([
    { ...row(), role: 'viewer' },
    { ...row(), is_read_only: true },
    { ...row(), custom_role_id: 'missing', configured_role_id: null },
    null
  ])('denies missing/read-only authority', async (value) => {
    mocks.query.mockResolvedValue(value)
    await expect(
      assertFreshDesignAccess('token', actor, client, 'write')
    ).rejects.toMatchObject({ statusCode: 403 })
  })
  it('requires agency authority for shared scope; marketing management is client-only', async () => {
    mocks.query.mockResolvedValue({
      ...row(),
      assigned: false,
      permission_groups: ['MARKETING_MANAGEMENT']
    })
    await expect(
      assertFreshDesignAccess('token', actor, null, 'read')
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(await assertFreshDesignAccess('token', actor, client, 'write')).toBe(
      'staff'
    )
    mocks.query.mockResolvedValue({
      ...row(),
      assigned: false,
      permission_groups: ['ADMIN', 'CREATIVE']
    })
    expect(await assertFreshDesignAccess('token', actor, null, 'write')).toBe(
      'designer'
    )
  })
  it('fails closed on database errors and changed actor identity', async () => {
    mocks.query.mockRejectedValue(new Error('database unavailable'))
    await expect(
      assertFreshDesignAccess('token', actor, client, 'write')
    ).rejects.toThrow('database unavailable')
    mocks.session.mockResolvedValue({ id: client })
    await expect(
      assertFreshDesignAccess('token', actor, client, 'write')
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
