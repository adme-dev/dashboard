import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('../../server/database/migrations/389_god_mode_mcp_action_arguments.sql', import.meta.url)

describe('MCP Godmode action-audit migration', () => {
  it('adds a bounded JSON action snapshot without weakening immutable history', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS action_arguments JSONB NOT NULL')
    expect(migration).toContain("jsonb_typeof(action_arguments) = 'object'")
    expect(migration).toContain('octet_length(action_arguments::TEXT) <= 16384')
    expect(migration).toContain('attempt.action_arguments = NEW.action_arguments')
    expect(migration).toContain('BEFORE INSERT ON god_mode_audit_events')
    expect(migration).toMatch(/channel = 'mcp'[\s\S]*phase IN \('ambiguous', 'succeeded', 'failed'\)/)
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i)
  })
})
