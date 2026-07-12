import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../server/database/migrations/226_hr_role_acknowledgement_notes.sql', import.meta.url), 'utf8')
const route = readFileSync(new URL('../../server/api/agency/hr/assignments/[id]/role-acknowledgement.patch.ts', import.meta.url), 'utf8')
const assignment = readFileSync(new URL('../../server/api/agency/hr/assignments/[id]/index.get.ts', import.meta.url), 'utf8')
const directRoute = readFileSync(new URL('../../server/api/agency/hr/role-assignments/[id]/acknowledgement.patch.ts', import.meta.url), 'utf8')

describe('HR role acknowledgement contract', () => {
  it('persists employee corrections and keeps the route participant-only and audited', () => {
    expect(migration).toContain('acknowledgement_note')
    expect(route).toContain("status: z.enum(['acknowledged', 'disputed'])")
    expect(route).toContain('Only the participant can acknowledge this role baseline')
    expect(route).toContain('recordHrAuditEvent')
    expect(route).toContain('acknowledgement_note = $2')
    expect(route).toContain('decideRoleAcknowledgement')
    expect(route).toContain("acknowledgement_status = 'pending'")
    expect(route).toContain('COALESCE(acknowledged_at, NOW())')
    expect(directRoute).toContain('decideRoleAcknowledgement')
    expect(directRoute).toContain("acknowledgement_status = 'pending'")
    expect(assignment).toContain('role_acknowledgement_status')
  })
})
