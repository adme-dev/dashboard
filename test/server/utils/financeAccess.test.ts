/* eslint-disable @stylistic/max-statements-per-line */
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertFinancePermission, assertPermissionGrant } from '~~/server/utils/financeAccess'

const db = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: db.query }))
const userId = '11111111-1111-4111-8111-111111111111'
const event = (role = 'owner') => ({ context: {
  user: { id: userId, role, userRole: role, isGodMode: true },
  permissionGroups: ['FINANCE', 'ADMIN'],
  resolvedPermissions: { groups: ['FINANCE'] }, godMode: { enabled: true }
} }) as unknown as H3Event

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.unstubAllEnvs() })

describe('explicit finance permission boundary', () => {
  it.each(['owner', 'admin', 'marketing', 'member'])('denies %s without a current explicit FINANCE grant despite cached or elevated context', async (role) => {
    db.query.mockResolvedValue(null)
    await expect(assertFinancePermission(event(role), userId)).rejects.toMatchObject({ statusCode: 403 })
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [userId, false, 'FINANCE'])
  })
  it.each(['owner', 'admin', 'marketing', 'member'])('allows %s only with a current explicit FINANCE grant', async (role) => {
    db.query.mockResolvedValue({ permission_group: 'FINANCE' })
    await expect(assertFinancePermission(event(role), userId)).resolves.toBeUndefined()
  })
  it('uses a current custom role instead of broadening a legacy owner role', async () => {
    db.query.mockResolvedValue(null)
    await expect(assertFinancePermission(event('owner'), userId)).rejects.toMatchObject({ statusCode: 403 })
    const [sql] = db.query.mock.calls[0]
    expect(sql).toContain('tm.custom_role_id IS NOT NULL')
    expect(sql).toContain('cr.id=tm.custom_role_id')
    expect(sql).toContain('tm.custom_role_id IS NULL')
    expect(sql).toContain('cr.slug=tm.user_role::text')
    expect(sql).toContain('cr.is_system=TRUE')
    expect(sql).toContain('tm.is_active=TRUE')
    expect(sql).toContain('rpg.permission_group=$3')
  })
  it('never accepts another group or an inactive/missing user', async () => {
    db.query.mockResolvedValue({ permission_group: 'ADMIN' })
    await expect(assertFinancePermission(event(), userId)).rejects.toMatchObject({ statusCode: 403 })
    db.query.mockResolvedValue(null)
    await expect(assertFinancePermission(event(), userId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('sees revocation on the next request, including the same user with forged cached groups', async () => {
    db.query.mockResolvedValueOnce({ permission_group: 'FINANCE' }).mockResolvedValueOnce(null)
    await expect(assertFinancePermission(event(), userId)).resolves.toBeUndefined()
    await expect(assertFinancePermission(event(), userId)).rejects.toMatchObject({ statusCode: 403 })
    expect(db.query).toHaveBeenCalledTimes(2)
  })
  it('fails closed with a safe 503 on database failure', async () => {
    db.query.mockRejectedValue(new Error('postgres://secret@private/db'))
    const error = await assertFinancePermission(event(), userId).catch(e => e)
    expect(error).toMatchObject({ statusCode: 503 })
    expect(String(error)).not.toContain('secret')
  })
  it('enforces the same denial during development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    db.query.mockResolvedValue(null)
    await expect(assertFinancePermission(event('owner'), userId)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('fresh explicit grant for client and invoice boundaries', () => {
  it.each(['CLIENTS', 'INVOICE_OWN_CLIENTS', 'ADMIN'] as const)('checks exact %s without a role-name or cached FINANCE fallback', async (group) => {
    db.query.mockResolvedValue({ permission_group: group })
    await expect(assertPermissionGrant(event(), userId, group)).resolves.toBeUndefined()
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [userId, false, group])
    db.query.mockResolvedValue({ permission_group: 'FINANCE' })
    await expect(assertPermissionGrant(event(), userId, group)).rejects.toMatchObject({ statusCode: 403 })
  })
})
