import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/263_monday_cutover_approval_artifacts.sql',
  import.meta.url
)

describe('Monday cutover approval migration', () => {
  it('creates one revisioned governed artifact per exact source and target board', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS monday_cutover_approval_artifacts')
    expect(migration).toContain('UNIQUE (source_board_id, target_board_id)')
    expect(migration).toContain('state IN (\'draft\', \'approved\')')
    expect(migration).toContain('jsonb_typeof(resolutions) = \'object\'')
    expect(migration).toContain('char_length(plan_fingerprint) = 64')
    expect(migration).toContain('approved_by UUID REFERENCES team_members(id) ON DELETE RESTRICT')
    expect(migration).toContain('target_board_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT')
  })

  it('records append-only revision evidence without duplicating raw resolutions', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS monday_cutover_approval_audit')
    expect(migration).toContain('action IN (\'saved\', \'approved\')')
    expect(migration).toContain('resolution_hash TEXT NOT NULL')
    expect(migration).not.toContain('monday_cutover_approval_audit (\n  resolutions')
    expect(migration).toContain('prevent_monday_cutover_audit_mutation')
    expect(migration).toContain('trg_monday_cutover_approval_audit_append_only')
  })
})
