import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL('../../server/database/migrations/227_hr_monday_evidence_scopes.sql', import.meta.url), 'utf8')
const get = readFileSync(new URL('../../server/api/agency/hr/monday/scopes.get.ts', import.meta.url), 'utf8')
const post = readFileSync(new URL('../../server/api/agency/hr/monday/scopes.post.ts', import.meta.url), 'utf8')
const revoke = readFileSync(new URL('../../server/api/agency/hr/monday/scopes/[id].delete.ts', import.meta.url), 'utf8')
const destinations = readFileSync(new URL('../../server/database/migrations/232_hr_monday_destination_mappings.sql', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../server/utils/hr/schemas.ts', import.meta.url), 'utf8')

describe('HR Monday scope security contract', () => {
  it('stores bounded allowlists and requires owner authorization for every mutation/read', () => {
    expect(migration).toContain('hr_monday_evidence_scopes')
    expect(migration).toContain('CHECK (period_end >= period_start)')
    expect(migration).toContain('retention_days BETWEEN 30 AND 2555')
    for (const route of [get, post, revoke]) {
      expect(route).toContain('requireHrAdmin(event)')
      expect(route).toContain("'Cache-Control', 'private, no-store'")
    }
    expect(post).toContain('hrMondayEvidenceScopeSchema.safeParse')
    expect(post).toContain("status = 'revoked'")
    expect(post).toContain('recordHrAuditEvent')
    expect(destinations).toContain('destination_mappings')
    expect(schema).toContain('Approved scopes require one destination for every approved board.')
    expect(post).toContain('input.destinationMappings')
    expect(post).toContain('$11::uuid')
    expect(post).toContain('ELSE NULL::uuid END')
    expect(revoke).toContain("status = 'revoked'")
    expect(revoke).toContain('UPDATE hr_knowledge_records SET revoked_at = NOW()')
    expect(revoke).toContain('deleteVector(event, vectorId)')
    expect(revoke).toContain('recordHrAuditEvent')
  })
})
