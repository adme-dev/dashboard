/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
import { expect, it } from 'vitest'
import { hasMarketingManagementPermission, isMarketingManagementContext } from '../../server/utils/marketingManagement'

it('requires the explicit group and never equates role strings or general management', () => {
  expect(hasMarketingManagementPermission(['MARKETING_MANAGEMENT'])).toBe(true)
  for (const groups of [undefined, null, [], ['ADMIN'], ['MANAGEMENT'], ['FINANCE'], ['marketing_management']]) {
    expect(hasMarketingManagementPermission(groups)).toBe(false)
  }
})
it('requires both fresh authority and the dedicated group at a context boundary', () => {
  expect(isMarketingManagementContext({ permissionGroups: ['MARKETING_MANAGEMENT'], mcpStaffAuthority: 'fresh' })).toBe(true)
  expect(isMarketingManagementContext({ permissionGroups: ['MARKETING_MANAGEMENT'] })).toBe(false)
  expect(isMarketingManagementContext({ permissionGroups: ['ADMIN'], mcpStaffAuthority: 'fresh' })).toBe(false)
  expect(isMarketingManagementContext({ userRole: 'MARKETING_MANAGEMENT', mcpStaffAuthority: 'fresh' } as any)).toBe(false)
})
