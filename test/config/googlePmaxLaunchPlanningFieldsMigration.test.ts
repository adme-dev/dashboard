import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/363_google_pmax_launch_planning_fields.sql', import.meta.url)

describe('Google PMax launch planning fields migration', () => {
  it('adds provider-backed planning fields required by normalization', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('\'google_connection_id\'')
    expect(sql).toContain('\'conversion_action_ids\'')
    expect(sql).toContain('\'inventory_condition\'')
    expect(sql).toContain('Provider-backed')
  })

  it('adds a durable launch config revision that advances after approved field edits', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('launch_config_version INTEGER NOT NULL DEFAULT 1')
    expect(sql).toContain('brief.has_ever_been_approved')
    expect(sql).toContain('launch_config_version = launch_config_version + 1')
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON brief_field_values')
    expect(sql).toContain('track_brief_approval_revision')
  })

  it('reconciles an approval revision trigger installed by an earlier draft', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_brief_approval_revision')
  })
})
