import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'server/database/migrations/342_ai_pilot_task_evidence_terminal_immutability.sql'
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

const terminalAuthorityFields = [
  'terminal_at',
  'terminal_outcome',
  'terminal_error_code',
  'fallback_used',
  'cost_usd_micros',
  'latency_ms',
  'assistant_message_id',
  'enforcement_scope_respected',
  'enforcement_approval_boundary_respected',
  'enforcement_prohibited_effects_count'
]

describe('AI pilot evidence terminal immutability migration', () => {
  it('preserves only replay no-ops and the issued-to-started-to-terminal-to-assessed state progression', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION enforce_ai_pilot_task_evidence_transition()')
    expect(migration).toMatch(/OLD\.state = 'issued' AND NEW\.state NOT IN \('issued', 'started'\)/)
    expect(migration).toMatch(/OLD\.state = 'started' AND NEW\.state NOT IN \('started', 'terminal'\)/)
    expect(migration).toMatch(/OLD\.state = 'terminal' AND NEW\.state NOT IN \('terminal', 'assessed'\)/)
    expect(migration).toMatch(/OLD\.state = 'terminal' AND NEW\.state = 'terminal' AND NEW IS DISTINCT FROM OLD/)
    expect(migration).toContain("OLD.state = 'assessed'")
  })

  it('freezes every terminal gate-bearing field during terminal-to-assessed transition', () => {
    const guard = migration.match(/IF OLD\.state = 'terminal' AND NEW\.state = 'assessed' THEN([\s\S]*?)END IF;/)?.[1] ?? ''

    for (const field of terminalAuthorityFields) {
      expect(guard, `${field} must be immutable after terminalization`).toContain(`NEW.${field}`)
      expect(guard, `${field} must be compared with its terminal value`).toContain(`OLD.${field}`)
    }
    expect(guard).toContain('pilot evidence terminal authority is immutable')
  })

  it('replaces the already-installed trigger without modifying migration 341 history', () => {
    expect(migration).toContain('DROP TRIGGER IF EXISTS trg_ai_pilot_task_evidence_transition ON ai_pilot_task_evidence')
    expect(migration).toContain('CREATE TRIGGER trg_ai_pilot_task_evidence_transition')
    expect(migration).toContain('BEFORE INSERT OR UPDATE OR DELETE ON ai_pilot_task_evidence')
  })
})
