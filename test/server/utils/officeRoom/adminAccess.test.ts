import { describe, expect, it } from 'vitest'
import { canAdministerOffice, isPlatformOfficeAdminRole } from '~~/server/utils/officeRoom'

describe('office admin access helpers', () => {
  it('treats office admin membership as admin access', () => {
    expect(canAdministerOffice(
      { role: 'member' },
      { role: 'admin' }
    )).toBe(true)
  })

  it('lets platform owner/admin roles administer offices even with member membership', () => {
    expect(canAdministerOffice({ role: 'owner' }, { role: 'member' })).toBe(true)
    expect(canAdministerOffice({ role: 'admin' }, { role: 'member' })).toBe(true)
    expect(canAdministerOffice({ role: 'super_admin' }, { role: 'member' })).toBe(true)
  })

  it('does not let ordinary office members administer offices', () => {
    expect(canAdministerOffice({ role: 'member' }, { role: 'member' })).toBe(false)
    expect(canAdministerOffice({ role: 'member' }, null)).toBe(false)
  })

  it('normalizes platform admin role checks', () => {
    expect(isPlatformOfficeAdminRole('owner')).toBe(true)
    expect(isPlatformOfficeAdminRole('admin')).toBe(true)
    expect(isPlatformOfficeAdminRole('super_admin')).toBe(true)
    expect(isPlatformOfficeAdminRole('member')).toBe(false)
    expect(isPlatformOfficeAdminRole(null)).toBe(false)
  })
})
