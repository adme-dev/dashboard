import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/api/agency/hr/monday/sync.post.ts', 'utf8')
const runner = readFileSync('server/utils/hr/mondaySyncRunner.ts', 'utf8')

describe('HR Monday sync security contract', () => {
  it('requires owner access, an approved scope, and a connection', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain('getActiveMondayEvidenceScope()')
    expect(source).toContain("startGovernedMondaySync(event, scope, user.id, 'manual')")
  })
  it('initializes per-board state and imports only explicitly allowlisted comments/files', () => {
    expect(runner).toContain('hr_monday_sync_states')
    expect(runner).toContain('UNNEST($2::text[])')
    expect(runner).toContain("importUpdates: scope.allowed_fields.includes('updates')")
    expect(runner).toContain("importFiles: scope.allowed_fields.includes('files')")
    expect(runner).toContain('scope.destination_mappings.map')
    expect(runner).toContain('MIN(last_completed_at)')
    expect(runner).toContain('runAfterResponse(event, work')
    expect(runner).toContain('monday_evidence.sync.started')
    expect(runner).toContain("INTERVAL '30 minutes'")
  })
})
