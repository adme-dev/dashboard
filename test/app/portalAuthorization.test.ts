import { describe, expect, it } from 'vitest'

import {
  canViewPortalCrmAudit,
  canViewPortalTeamAccess,
} from '../../app/utils/permissions'

describe('portal authorization display gates', () => {
  it('only exposes the team directory to primary contacts and user inviters', () => {
    expect(canViewPortalTeamAccess({ isPrimaryContact: true })).toBe(true)
    expect(canViewPortalTeamAccess({ permissions: { canInviteUsers: true } })).toBe(true)
    expect(canViewPortalTeamAccess({ permissions: {} })).toBe(false)
    expect(canViewPortalTeamAccess(null)).toBe(false)
  })

  it('only exposes CRM audit history to primary contacts and CRM admins', () => {
    expect(canViewPortalCrmAudit({ isPrimaryContact: true })).toBe(true)
    expect(canViewPortalCrmAudit({ permissions: { canAdminCrm: true } })).toBe(true)
    expect(canViewPortalCrmAudit({ permissions: {} })).toBe(false)
    expect(canViewPortalCrmAudit(null)).toBe(false)
  })
})
