import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/350_google_pmax_budget_contract.sql', import.meta.url),
  'utf8'
)

describe('Google PMax budget contract migration 350', () => {
  it('adds explicit fixed-flight allocation and currency fields', () => {
    expect(migration).toContain('\'budget_period\'')
    expect(migration).toContain('\'allocated_total\'')
    expect(migration).toContain('\'budget_currency\'')
    expect(migration).toContain('fixed_flight')
    expect(migration).toContain('Australian dollar (AUD)')
  })

  it('requires allocation and end date for Inventory briefs', () => {
    expect(migration).toMatch(/'allocated_total'[\s\S]*pmax_type[\s\S]*inventory[\s\S]*require/)
    expect(migration).toMatch(/UPDATE brief_template_fields f[\s\S]*pmax_type[\s\S]*inventory[\s\S]*require[\s\S]*field_key = 'end_date'/)
  })

  it('retains legacy daily budget values without treating them as provider totals', () => {
    expect(migration).toContain('field_key = \'daily_budget\'')
    expect(migration).toContain('field_label = \'Legacy Daily Budget\'')
    expect(migration).toMatch(/field_label = 'Legacy Daily Budget'[\s\S]*is_required = false[\s\S]*field_key = 'daily_budget'/)
    expect(migration).not.toMatch(/DELETE[\s\S]*daily_budget/i)
    expect(migration).not.toMatch(/SET\s+allocated_total\s*=/i)
  })

  it('does not persist derived campaign days or daily pace as brief source fields', () => {
    expect(migration).not.toContain('\'campaign_days\'')
    expect(migration).not.toContain('\'calculated_daily_pace\'')
  })

  it('is transactional and idempotent', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toContain('ON CONFLICT (template_id, field_key) DO UPDATE')
  })
})
