import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/274_ai_evaluation_approval_store.sql', import.meta.url),
  'utf8'
)
const runbook = readFileSync(
  new URL('../../docs/runbooks/ai-evaluation-approval-store-274.md', import.meta.url),
  'utf8'
)

describe('AI evaluation approval store migration 274', () => {
  it('creates separate immutable pricing, plan, approval and revocation evidence', () => {
    for (const table of [
      'ai_eval_model_rate_cards',
      'ai_eval_model_rate_card_revocations',
      'ai_eval_execution_plans',
      'ai_eval_cost_approvals',
      'ai_eval_cost_approval_revocations'
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
    expect(migration.match(/prevent_ai_eval_approval_artifact_mutation/g)?.length).toBeGreaterThanOrEqual(6)
  })

  it('binds one approval to one stored run plan and rate card', () => {
    expect(migration).toMatch(/evaluation_run_id UUID NOT NULL UNIQUE/)
    expect(migration).toMatch(/FOREIGN KEY \(evaluation_run_id, department_id\)[\s\S]*REFERENCES ai_eval_runs\(id, department_id\)/)
    expect(migration).toMatch(/FOREIGN KEY \(evaluation_run_id, plan_digest, rate_card_id\)[\s\S]*REFERENCES ai_eval_execution_plans/)
    expect(migration).toContain('CHECK (expires_at > approved_at)')
  })

  it('blocks update, delete and truncate operations on every evidence table', () => {
    expect(migration.match(/BEFORE UPDATE OR DELETE OR TRUNCATE/g)?.length).toBe(5)
    expect(migration.match(/FOR EACH STATEMENT EXECUTE FUNCTION prevent_ai_eval_approval_artifact_mutation\(\)/g)?.length).toBe(5)
  })

  it('documents zero-call behavior and non-destructive rollback', () => {
    expect(runbook).toContain('does not call, enqueue, or schedule a model')
    expect(runbook).toContain('Dormant rollback')
    expect(runbook).toContain('Do not delete approval evidence')
  })
})
