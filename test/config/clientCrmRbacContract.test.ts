import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('client CRM RBAC contract', () => {
  it('adds explicit permissions with a compatibility backfill and audit ledger', () => {
    const migration = read('../../server/database/migrations/304_client_crm_rbac.sql')
    expect(migration).toContain('can_view_crm')
    expect(migration).toContain('can_edit_crm')
    expect(migration).toContain('can_admin_crm')
    expect(migration).toContain('crm_security_audit_log')
    expect(migration).toContain("lead_capture_mode IN ('lightweight_crm', 'full_crm')")
  })

  it('gates the complete portal CRM namespace behind client auth and entitlements', () => {
    const middleware = read('../../server/middleware/04-client-crm-access.ts')
    const access = read('../../server/utils/crm/clientCrmAccess.ts')
    const auth = read('../../server/middleware/auth.ts')
    expect(middleware).toContain("const CRM_API_PREFIX = '/api/client-portal/crm'")
    expect(middleware).toContain('requireClientCrmAccess')
    expect(access).toContain("requireClientEntitlement(client.clientId, 'crm.core')")
    expect(auth).toContain("'/api/client-portal/crm/'")
  })

  it('allows agency administrators to assign all CRM access levels', () => {
    const invite = read('../../server/api/agency/client-portal/invite.post.ts')
    const update = read('../../server/api/agency/client-portal/users/[id].put.ts')
    for (const permission of ['canViewCrm', 'canEditCrm', 'canAdminCrm']) {
      expect(invite).toContain(permission)
      expect(update).toContain(permission)
    }
  })
})
