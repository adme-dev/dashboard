import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/271_ai_capability_catalog_and_evaluations.sql', import.meta.url),
  'utf8'
)

const rollbackNotes = readFileSync(
  new URL('../../docs/runbooks/ai-capability-catalog-migration-271.md', import.meta.url),
  'utf8'
)

const requiredTables = [
  'ai_eval_suites',
  'ai_capability_packs',
  'ai_capabilities',
  'ai_capability_pack_versions',
  'ai_capability_versions',
  'ai_capability_tool_bindings',
  'ai_pack_version_capabilities',
  'ai_eval_suite_versions',
  'ai_eval_cases',
  'ai_eval_runs',
  'ai_eval_case_results',
  'ai_capability_releases',
  'ai_pack_releases',
  'ai_catalog_audit_events'
]

describe('AI capability catalog and evaluation migration 271', () => {
  it('creates the versioned catalog, evaluation, release and audit records', () => {
    for (const table of requiredTables) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })

  it('binds every pack, capability and evaluation suite to a department and owner', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS ai_eval_suites[\s\S]*department_id UUID NOT NULL REFERENCES departments\(id\)[\s\S]*owner_user_id UUID NOT NULL REFERENCES team_members\(id\)/)
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS ai_capability_packs[\s\S]*department_id UUID NOT NULL REFERENCES departments\(id\)[\s\S]*owner_user_id UUID NOT NULL REFERENCES team_members\(id\)/)
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS ai_capabilities[\s\S]*department_id UUID NOT NULL REFERENCES departments\(id\)[\s\S]*owner_user_id UUID NOT NULL REFERENCES team_members\(id\)/)
    expect(migration.match(/FOREIGN KEY \(department_id, owner_user_id\)/g)).toHaveLength(3)
    expect(migration.match(/REFERENCES department_members\(department_id, team_member_id\)/g)).toHaveLength(3)
  })

  it('prevents cross-department pack, capability, suite and run bindings', () => {
    expect(migration).toMatch(/FOREIGN KEY \(pack_version_id, department_id\)[\s\S]*REFERENCES ai_capability_pack_versions\(id, department_id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(capability_version_id, department_id\)[\s\S]*REFERENCES ai_capability_versions\(id, department_id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(eval_suite_version_id, department_id\)[\s\S]*REFERENCES ai_eval_suite_versions\(id, department_id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(evaluation_run_id, department_id\)[\s\S]*REFERENCES ai_eval_runs\(id, department_id\)/)
  })

  it('uses safe release defaults and exposes no direct-execution binding mode', () => {
    expect(migration).toContain('release_state TEXT NOT NULL DEFAULT \'draft\'')
    for (const state of ['draft', 'pilot', 'active', 'suspended', 'retired']) {
      expect(migration).toContain(`'${state}'`)
    }
    expect(migration).toContain('access_mode IN (\'read\', \'draft\', \'propose\')')
    expect(migration).not.toMatch(/access_mode IN \([^)]*'execute'/)
  })

  it('makes material versions, cases, results and audit evidence append-only', () => {
    expect(migration).toContain('prevent_ai_governance_immutable_mutation')
    for (const trigger of [
      'trg_ai_capability_pack_versions_immutable',
      'trg_ai_capability_versions_immutable',
      'trg_ai_eval_suite_versions_immutable',
      'trg_ai_eval_cases_immutable',
      'trg_ai_eval_case_results_immutable',
      'trg_ai_catalog_audit_events_immutable'
    ]) {
      expect(migration).toContain(trigger)
    }
  })

  it('uses row-type-specific sealing triggers for material child records', () => {
    expect(migration).toContain('prevent_ai_capability_binding_after_evidence')
    expect(migration).toContain('prevent_ai_pack_binding_after_evidence')
    expect(migration).toContain('prevent_ai_eval_case_after_run')
    expect(migration).not.toContain('prevent_ai_material_child_change_after_evidence')
  })

  it('version-binds evaluation evidence and stores opaque trace references only', () => {
    expect(migration).toContain('prompt_version_digest TEXT NOT NULL')
    expect(migration).toContain('toolset_version_digest TEXT NOT NULL')
    expect(migration).toContain('model_provider TEXT NOT NULL')
    expect(migration).toContain('model_id TEXT NOT NULL')
    expect(migration).toContain('trace_ref TEXT')
    expect(migration).toContain('protect_ai_eval_run_evidence')
    expect(migration).toContain('prevent_ai_eval_result_outside_running')
    expect(migration).not.toMatch(/^\s*(raw_trace|raw_output|system_prompt|access_token|refresh_token|api_key|password)\s+/im)
  })

  it('requires run evidence to use the suite declared by the material version', () => {
    expect(migration).toContain('AI evaluation run suite must match every bound material version')
    expect(migration).toMatch(/ai_capability_versions[\s\S]*evaluation_suite_id[\s\S]*NEW\.capability_version_id/)
    expect(migration).toMatch(/ai_capability_pack_versions[\s\S]*evaluation_suite_id[\s\S]*NEW\.pack_version_id/)
  })

  it('requires completed passing evidence for pilot and active releases', () => {
    expect(migration).toContain('evaluation_gate_passed BOOLEAN')
    expect(migration).toContain('evaluation_run_status TEXT')
    expect(migration).toMatch(/release_state NOT IN \('pilot', 'active'\)[\s\S]*evaluation_gate_passed = TRUE[\s\S]*evaluation_run_status = 'completed'/)
    expect(migration).toMatch(/FOREIGN KEY \(evaluation_run_id, capability_version_id, department_id, evaluation_gate_passed, evaluation_run_status\)/)
    expect(migration).toMatch(/FOREIGN KEY \(evaluation_run_id, pack_version_id, department_id, evaluation_gate_passed, evaluation_run_status\)/)
    expect(migration).toContain('coalesce(sum(input_tokens), 0)')
    expect(migration).toContain('coalesce(sum(cost_usd_micros), 0)')
  })

  it('blocks common secret and PII keys from evaluation fixtures', () => {
    for (const key of [
      'access_token', 'refresh_token', 'api_key', 'secret', 'password', 'email', 'phone',
      'prototype', 'constructor', 'proto'
    ]) {
      expect(migration).toContain(`'${key}'`)
    }
    expect(migration).toContain('p_depth > 12')
    expect(migration).toContain('jsonb_array_length(p_value) > 500')
    expect(migration).toContain('octet_length(input::text) <= 1000000')
  })

  it('bounds persisted evaluation payloads to the public contracts', () => {
    expect(migration).toContain('ai_governance_jsonb_node_count(input) <= 5000')
    expect(migration).toContain('cardinality(expected_tools) <= 64')
    expect(migration).toContain('cardinality(required_sources) <= 64')
    expect(migration).toContain('jsonb_array_length(scoring_rubric) BETWEEN 1 AND 32')
    expect(migration).toContain('cardinality(observed_tools) <= 64')
    expect(migration).toContain('cardinality(source_refs) <= 128')
    expect(migration).toContain('char_length(trace_ref) <= 500')
  })

  it('documents dormant rollback and forward-fix without destructive evidence deletion', () => {
    expect(rollbackNotes).toContain('Forward-fix is the default')
    expect(rollbackNotes).toContain('Dormant rollback')
    expect(rollbackNotes).toContain('Do not delete version, evaluation, release, or audit evidence')
  })
})
