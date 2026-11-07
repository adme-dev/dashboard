/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAccountingUiGroups } from '~~/server/utils/accountingUiPermissions'

const grant = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/financeAccess', () => ({ assertPermissionGrant: grant }))
beforeEach(() => vi.clearAllMocks())
describe('fresh accounting navigation permissions', () => {
  it('removes cached or static accounting grants while preserving campaign permissions', async () => {
    grant.mockRejectedValue({ statusCode: 403 })
    await expect(resolveAccountingUiGroups({} as any, 'user', ['FINANCE', 'INVOICE_OWN_CLIENTS', 'MEDIA_BUYING', 'CLIENTS'])).resolves.toEqual(['MEDIA_BUYING', 'CLIENTS'])
  })
  it('shows newly granted scoped billing without company accounting', async () => {
    grant.mockImplementation((_e, _id, group) => group === 'INVOICE_OWN_CLIENTS' ? Promise.resolve() : Promise.reject({ statusCode: 403 }))
    await expect(resolveAccountingUiGroups({} as any, 'user', ['CLIENTS'])).resolves.toEqual(['CLIENTS', 'INVOICE_OWN_CLIENTS'])
  })
  it('propagates database errors rather than advertising unverified accounting access', async () => {
    grant.mockRejectedValue({ statusCode: 503 })
    await expect(resolveAccountingUiGroups({} as any, 'user', ['FINANCE'])).rejects.toMatchObject({ statusCode: 503 })
  })
})
