/* eslint-disable @stylistic/max-statements-per-line */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requirePermission, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

const m = vi.hoisted(() => ({ finance: vi.fn(), bypass: vi.fn() }))
vi.mock('~~/server/utils/financeAccess', () => ({ assertFinancePermission: m.finance }))
vi.mock('~~/server/utils/godMode/featureGate', () => ({ canBypassApplicationControl: m.bypass }))
const event = (role = 'owner') => ({ method: 'GET', context: { user: { id: 'actor', role, is_active: true, permissionGroups: ['FINANCE'] } } }) as never
beforeEach(() => { vi.clearAllMocks(); m.finance.mockResolvedValue(undefined); m.bypass.mockResolvedValue(true) })
describe('Finance gates use current grants instead of role/default/owner bypass', () => {
  it('denies a revoked owner through the legacy Finance role helper', async () => {
    m.finance.mockRejectedValue({ statusCode: 403 })
    await expect(requireRole(event(), PERMISSIONS.FINANCE)).rejects.toMatchObject({ statusCode: 403 })
    expect(m.bypass).not.toHaveBeenCalled()
  })
  it('denies a revoked owner through the permission helper', async () => {
    m.finance.mockRejectedValue({ statusCode: 403 })
    await expect(requirePermission(event(), 'FINANCE')).rejects.toMatchObject({ statusCode: 403 })
    expect(m.bypass).not.toHaveBeenCalled()
  })
  it('accepts a current explicit grant and retains unrelated role checks', async () => {
    await expect(requirePermission(event('member'), 'FINANCE')).resolves.toMatchObject({ id: 'actor' })
    expect(m.finance).toHaveBeenCalledWith(expect.anything(), 'actor')
    m.finance.mockClear()
    await requireRole(event(), PERMISSIONS.ADMIN)
    expect(m.finance).not.toHaveBeenCalled()
  })
})
