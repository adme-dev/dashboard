import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'server/database/migrations/343_ai_pilot_task_evidence_state_progression.sql'
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

const terminalFields = [
  'terminal_at', 'terminal_outcome', 'terminal_error_code', 'fallback_used',
  'cost_usd_micros', 'latency_ms', 'assistant_message_id',
  'enforcement_scope_respected', 'enforcement_approval_boundary_respected',
  'enforcement_prohibited_effects_count'
]

const assessmentFields = [
  'assessed_at', 'assessor_user_id', 'assessor_reason', 'scope_respected',
  'approval_boundary_respected', 'prohibited_effect_observed', 'freshness_respected',
  'fabrication_observed', 'credential_leak_observed'
]

function section(start: string, end: string) {
  const from = migration.indexOf(start)
  const to = from < 0 ? -1 : migration.indexOf(end, from + start.length)
  return from < 0 || to < 0 ? '' : migration.slice(from, to)
}

function expectNullSafeNullGuard(sql: string, fields: string[]) {
  expect(sql).toContain('IS DISTINCT FROM')
  for (const field of fields) expect(sql, `${field} must be guarded`).toContain(`NEW.${field}`)
}

describe('AI pilot evidence state progression migration', () => {
  it('uses equal-arity NULL-safe row comparisons for every guarded allowlist', () => {
    const guards = [...migration.matchAll(/ROW\(([\s\S]*?)\)\s+IS DISTINCT FROM\s+ROW\(([\s\S]*?)\)/g)]
    expect(guards.length).toBeGreaterThanOrEqual(4)
    for (const guard of guards) {
      expect(guard[1]!.split(',').length).toBe(guard[2]!.split(',').length)
    }
  })

  it('rejects direct assessed inserts and every prepopulated non-issuance field', () => {
    const insertGuard = section("IF TG_OP = 'INSERT' THEN", 'SELECT EXISTS (')

    expect(insertGuard).toContain("NEW.state IS DISTINCT FROM 'issued'")
    expectNullSafeNullGuard(insertGuard, ['started_at', ...terminalFields, ...assessmentFields])
    expect(insertGuard).toContain('pilot evidence insert must be issued-only')
  })

  it('rejects terminal, enforcement, or assessment data preloaded during issued-to-started', () => {
    const startedGuard = section("IF NEW.state = 'started'", "IF NEW.state = 'terminal'")

    expectNullSafeNullGuard(startedGuard, [...terminalFields, ...assessmentFields])
    expect(startedGuard).toContain('started pilot evidence contains forbidden fields')
  })

  it('rejects assessor provenance or verdicts preloaded during started-to-terminal', () => {
    const terminalGuard = section("IF NEW.state = 'terminal'", "IF OLD.state = 'issued'")

    expectNullSafeNullGuard(terminalGuard, assessmentFields)
    expect(terminalGuard).toContain('terminal pilot evidence contains assessment fields')
  })

  it('preserves canonical forward transitions, exact replays, assessed immutability, and delete rejection', () => {
    expect(migration).toContain("IF TG_OP = 'DELETE' THEN")
    expect(migration).toMatch(/IF NEW\.state = OLD\.state THEN[\s\S]*?NEW IS DISTINCT FROM OLD[\s\S]*?RETURN NEW;/)
    expect(migration).toMatch(/OLD\.state = 'issued' AND NEW\.state <> 'started'/)
    expect(migration).toMatch(/OLD\.state = 'started' AND NEW\.state <> 'terminal'/)
    expect(migration).toMatch(/OLD\.state = 'terminal' AND NEW\.state <> 'assessed'/)
    expect(migration).toContain("OLD.state = 'assessed'")
    expect(migration).toContain('assessed pilot evidence is immutable')
  })

  it('freezes identity, start, terminal, and enforcement authority during terminal-to-assessed', () => {
    const assessmentTransition = section("IF OLD.state = 'terminal' AND NEW.state = 'assessed'", 'RETURN NEW;')

    expect(assessmentTransition).toContain('NEW.started_at')
    expectNullSafeNullGuard(assessmentTransition, terminalFields)
    expect(assessmentTransition).toContain('pilot evidence terminal authority is immutable')
    expect(migration).toContain('pilot evidence identity is immutable')
  })

  it('replaces one transition trigger without rewriting applied migration history', () => {
    expect(migration).toContain('DROP TRIGGER IF EXISTS trg_ai_pilot_task_evidence_transition ON ai_pilot_task_evidence')
    expect(migration).toContain('CREATE TRIGGER trg_ai_pilot_task_evidence_transition')
    expect(migration).toContain('BEFORE INSERT OR UPDATE OR DELETE ON ai_pilot_task_evidence')
  })
})
