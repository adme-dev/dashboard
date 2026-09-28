import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canAccessQrCodes, hasAgencyQrAccess } from '../../shared/qr/permissions'
import { requireQrAccess, requireQrClientAccess } from '../../server/utils/qr/permissions'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), fresh: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.query, queryOneFresh: mocks.fresh, query: vi.fn() }))

const clientId = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.fresh.mockResolvedValue(null)
})

describe('QR-only permissions', () => {
  it('lets an explicitly granted member use QR tools without a media role', async () => {
    const user = { id: 'tina', role: 'member', permissionGroups: ['QR_CODES'] }
    mocks.auth.mockResolvedValue(user)
    expect(canAccessQrCodes(user)).toBe(true)
    expect(hasAgencyQrAccess(user)).toBe(true)
    expect(await requireQrClientAccess({} as H3Event, clientId)).toEqual(user)
    expect(mocks.query).not.toHaveBeenCalled()
    expect(user.permissionGroups).not.toContain('MEDIA_BUYING')
  })
  it.each(['member', 'finance', 'creative', 'developer'])('does not grant QR by an unrelated %s role', async (role) => {
    const user = { id: 'u', role, permissionGroups: [] }
    mocks.auth.mockResolvedValue(user)
    expect(canAccessQrCodes(user)).toBe(false)
    await expect(requireQrAccess({} as H3Event)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    { role: 'viewer', permissionGroups: ['QR_CODES'] },
    { role: 'guest', permissionGroups: ['QR_CODES'] },
    { role: 'member', permissionGroups: ['QR_CODES'], isCustomReadOnly: true }
  ])('rejects read-only users even with an erroneous grant', async (subject) => {
    mocks.auth.mockResolvedValue({ id: 'u', ...subject })
    expect(canAccessQrCodes(subject)).toBe(false)
    expect(hasAgencyQrAccess(subject)).toBe(false)
    await expect(requireQrClientAccess({} as H3Event, clientId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('retains client assignment enforcement for existing media users', async () => {
    const user = { id: 'u', role: 'media_buyer', permissionGroups: ['MEDIA_BUYING'] }
    mocks.auth.mockResolvedValue(user)
    mocks.query.mockResolvedValue(null)
    expect(canAccessQrCodes(user)).toBe(true)
    expect(hasAgencyQrAccess(user)).toBe(false)
    await expect(requireQrClientAccess({} as H3Event, clientId)).rejects.toMatchObject({ statusCode: 403 })
    mocks.query.mockResolvedValue({ assigned: 1 })
    expect(await requireQrClientAccess({} as H3Event, clientId)).toEqual(user)
    expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining('client_team_assignments'), [clientId, 'u'])
  })
  it('validates a client id before the database query', async () => {
    mocks.auth.mockResolvedValue({ id: 'u', role: 'member', permissionGroups: ['QR_CODES'] })
    await expect(requireQrClientAccess({} as H3Event, 'bad')).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('preserves management access and rejects unauthenticated UI state', () => {
    expect(hasAgencyQrAccess({ role: 'owner' })).toBe(true)
    expect(canAccessQrCodes(null)).toBe(false)
  })
  it('grants current creative/marketing membership and revokes it without changing cached groups', async () => {
    const user = { id: 'tina', role: 'member', permissionGroups: [] }
    mocks.auth.mockResolvedValue(user)
    mocks.fresh.mockResolvedValueOnce({ allowed: true })
    expect((await requireQrClientAccess({} as H3Event, clientId)).permissionGroups).toContain('QR_CODES')
    expect(user.permissionGroups).toEqual([])
    expect(mocks.fresh).toHaveBeenCalledWith(expect.stringContaining('t.is_active = true'), [user.id, [
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000004'
    ]])
    await expect(requireQrClientAccess({} as H3Event, clientId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not derive team grants for a read-only user', async () => {
    mocks.auth.mockResolvedValue({ id: 'u', role: 'member', permissionGroups: [], isCustomReadOnly: true })
    mocks.fresh.mockResolvedValue({ allowed: true })
    await expect(requireQrAccess({} as H3Event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.fresh).not.toHaveBeenCalled()
  })
})
