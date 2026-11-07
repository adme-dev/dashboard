import { describe, expect, it } from 'vitest'
import { hasExplicitFinancePermission, hasExplicitInvoicePermission } from '~~/shared/finance/permissions'

describe('finance UI permission', () => {
  it('shows accounting only for an explicit resolved grant', () => {
    expect(hasExplicitFinancePermission({ permissionGroups: ['FINANCE'] })).toBe(true)
    expect(hasExplicitFinancePermission({ permissionGroups: ['MARKETING_MANAGEMENT', 'MEDIA_BUYING'] })).toBe(false)
    expect(hasExplicitFinancePermission(null)).toBe(false)
  })
  it('does not infer Finance from owner/admin or absent groups', () => {
    expect(hasExplicitFinancePermission({ role: 'owner' })).toBe(false)
    expect(hasExplicitFinancePermission({ role: 'admin', permissionGroups: [] })).toBe(false)
  })
})

describe('scoped invoice UI permission', () => {
  it('retains Finance and assigned-client invoice grants without a role bypass', () => {
    expect(hasExplicitInvoicePermission({ permissionGroups: ['FINANCE'] })).toBe(true)
    expect(hasExplicitInvoicePermission({ permissionGroups: ['INVOICE_OWN_CLIENTS'] })).toBe(true)
    expect(hasExplicitInvoicePermission({ role: 'account_manager', permissionGroups: ['CLIENTS'] })).toBe(false)
    expect(hasExplicitInvoicePermission({ role: 'owner' })).toBe(false)
  })
})
