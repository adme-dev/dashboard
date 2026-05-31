import { describe, it, expect } from 'vitest'
import { isManagementRole, ANALYTICS_ROLES, isUuid } from '../../../../server/utils/tracking/analytics-access'

describe('isUuid', () => {
  it('accepts canonical UUIDs and rejects junk', () => {
    expect(isUuid('6ff24c19-b238-465e-a4e2-fba84e8a4f42')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })
})

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
