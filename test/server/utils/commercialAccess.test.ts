/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertCommercialPermission } from '~~/server/utils/commercialAccess'

const grant = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/financeAccess', () => ({ assertPermissionGrant: grant }))
beforeEach(() => vi.clearAllMocks())
describe('commercial permission admission', () => {
  it('accepts CLIENTS without granting company accounting', async () => {
    grant.mockResolvedValue(undefined)
    await expect(assertCommercialPermission({} as any, 'user', 'CLIENTS')).resolves.toBeUndefined()
    expect(grant).toHaveBeenCalledExactlyOnceWith({}, 'user', 'CLIENTS', false)
  })
  it('accepts Finance only after a denied commercial grant', async () => {
    grant.mockRejectedValueOnce({ statusCode: 403 }).mockResolvedValueOnce(undefined)
    await expect(assertCommercialPermission({} as any, 'user', 'SALES', true)).resolves.toBeUndefined()
    expect(grant).toHaveBeenLastCalledWith({}, 'user', 'FINANCE', true)
  })
  it('propagates permission lookup failure rather than falling back', async () => {
    grant.mockRejectedValue({ statusCode: 503 })
    await expect(assertCommercialPermission({} as any, 'user', 'CLIENTS')).rejects.toMatchObject({ statusCode: 503 })
    expect(grant).toHaveBeenCalledTimes(1)
  })
  it('denies absent grants including read-only writes', async () => {
    grant.mockRejectedValue({ statusCode: 403 })
    await expect(assertCommercialPermission({} as any, 'user', 'SALES', true)).rejects.toMatchObject({ statusCode: 403 })
  })
})
