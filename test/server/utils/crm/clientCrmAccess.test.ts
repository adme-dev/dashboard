import { describe, expect, it } from 'vitest'
import {
  hasClientCrmPermission,
  resolveClientCrmAccessLevel
} from '../../../../server/utils/crm/clientCrmAccess'

const subject = (
  permissions: Partial<{
    canViewCrm: boolean
    canEditCrm: boolean
    canAdminCrm: boolean
    canInviteUsers: boolean
  }>,
  isPrimaryContact = false
) => ({
  isPrimaryContact,
  permissions: {
    canViewCrm: false,
    canEditCrm: false,
    canAdminCrm: false,
    ...permissions
  }
}) as unknown as Parameters<typeof hasClientCrmPermission>[0]

describe('client CRM access', () => {
  it('uses hierarchical CRM permissions', () => {
    expect(hasClientCrmPermission(subject({ canViewCrm: true }), 'view')).toBe(true)
    expect(hasClientCrmPermission(subject({ canViewCrm: true }), 'edit')).toBe(false)
    expect(hasClientCrmPermission(subject({ canEditCrm: true }), 'view')).toBe(true)
    expect(hasClientCrmPermission(subject({ canEditCrm: true }), 'edit')).toBe(true)
    expect(hasClientCrmPermission(subject({ canAdminCrm: true }), 'admin')).toBe(true)
    expect(hasClientCrmPermission(subject({}, true), 'admin')).toBe(true)
  })

  it('requires admin for destructive and high-risk operations', () => {
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people/123', 'DELETE')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people/import', 'POST')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/export', 'GET')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/audit', 'GET')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/email-routes', 'POST')).toBe('admin')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/email-routes/123/rotate', 'POST')).toBe('admin')
  })

  it('allows CRM administrators and primary contacts, but not invitation-only users, to manage inbox routes', () => {
    expect(hasClientCrmPermission(subject({ canAdminCrm: true }), 'admin')).toBe(true)
    expect(hasClientCrmPermission(subject({}, true), 'admin')).toBe(true)
    expect(hasClientCrmPermission(subject({ canInviteUsers: true }), 'admin')).toBe(false)
  })

  it('uses view for reads and edit for ordinary mutations', () => {
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people', 'GET')).toBe('view')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/people', 'POST')).toBe('edit')
    expect(resolveClientCrmAccessLevel('/api/client-portal/crm/tasks/123', 'PATCH')).toBe('edit')
  })
})
