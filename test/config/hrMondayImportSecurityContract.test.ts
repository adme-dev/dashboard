import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/api/agency/hr/monday/import.post.ts', 'utf8')
const migration = readFileSync('server/utils/mondayMigration.ts', 'utf8')

describe('HR Monday import security contract', () => {
  it('requires an owner and an approved scope', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain('getActiveMondayEvidenceScope()')
    expect(source).toContain('approved Monday evidence scope is required')
  })

  it('reuses the migration service only for approved boards and excludes sensitive payloads by default', () => {
    expect(source).toContain('boardMappings: scope.destination_mappings.map')
    expect(source).toContain('importUpdates: false')
    expect(source).toContain('importFiles: false')
    expect(source).toContain('allowedFields: scope.allowed_fields')
    expect(source).toContain("updatedSince: `${scope.period_start}T00:00:00.000Z`")
    expect(source).toContain("updatedUntil: `${scope.period_end}T23:59:59.999Z`")
    expect(source).toContain('monday_evidence.import.started')
    expect(source).toContain('runAfterResponse(event, service.migrate()')
    expect(migration).toContain('resolveMigrationBoards(this.client, this.config)')
    expect(migration).toContain('client.getBoard(boardId)')
  })
})
