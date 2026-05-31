import { describe, it, expect } from 'vitest'
import { isManagementRole, ANALYTICS_ROLES } from '../../../../server/utils/tracking/analytics-access'

describe('isManagementRole', () => {
  it('treats owner/admin/lead/project_manager as management (see all clients)', () => {
    expect(isManagementRole('owner')).toBe(true)
    expect(isManagementRole('admin')).toBe(true)
    expect(isManagementRole('lead')).toBe(true)
    expect(isManagementRole('project_manager')).toBe(true)
  })
  it('treats scoped roles as non-management', () => {
    expect(isManagementRole('media_buyer')).toBe(false)
    expect(isManagementRole('account_manager')).toBe(false)
  })
  it('exposes the full allowed-role set including scoped roles', () => {
    expect(ANALYTICS_ROLES).toContain('media_buyer')
    expect(ANALYTICS_ROLES).toContain('owner')
  })
})
