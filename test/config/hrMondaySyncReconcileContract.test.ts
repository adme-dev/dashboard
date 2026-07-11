import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/api/agency/hr/monday/sync/reconcile.post.ts', 'utf8')
const reconciler = readFileSync('server/utils/hr/mondaySyncReconcile.ts', 'utf8')
describe('HR Monday sync reconciliation contract', () => {
  it('requires owner access, scope, and a migration session', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain('getActiveMondayEvidenceScope()')
    expect(source).toContain('sessionId is required')
  })
  it('persists board status, counts, failures, and audit evidence', () => {
    expect(source).toContain('reconcileMondaySyncSession')
    expect(reconciler).toContain('hr_monday_sync_states')
    expect(reconciler).toContain('records_created')
    expect(reconciler).toContain('records_failed')
    expect(reconciler).toContain("CASE WHEN $1::text = 'completed' THEN NOW() ELSE last_completed_at END")
    expect(reconciler).toContain('records_seen = COALESCE($2::integer, records_seen)')
    expect(source).toContain('monday_evidence.sync.reconciled')
  })
})
