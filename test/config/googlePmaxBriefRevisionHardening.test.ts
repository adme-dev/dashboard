import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/352_google_pmax_launch_planning_fields.sql', import.meta.url)

describe('Google PMax approved brief revision hardening', () => {
  it('tracks edits after first approval even during re-review', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('has_ever_been_approved BOOLEAN NOT NULL DEFAULT false')
    expect(sql).toContain('brief.has_ever_been_approved')
    expect(sql).toContain('NEW.status = \'approved\'')
    expect(sql).toContain('OLD.has_ever_been_approved')
    expect(sql).toContain('NEW.launch_config_version := NEW.launch_config_version + 1')
  })

  it('defers dynamic provider selections to launch planning instead of brief submission', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('\'google_connection_id\'')
    expect(sql).toContain('\'conversion_action_ids\'')
    expect(sql).toContain('"action":"show"')
    expect(sql).toContain('launch planning before approval')
  })
})
