import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync('server/database/migrations/235_hr_monday_evidence_history.sql', 'utf8')
const processor = readFileSync('server/api/cron/monday-webhooks.post.ts', 'utf8')

describe('HR Monday evidence history contract', () => {
  it('stores minimal immutable source-event references', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hr_monday_evidence_events')
    expect(migration).toContain('webhook_event_id UUID NOT NULL UNIQUE')
    expect(migration).not.toContain('payload JSONB')
  })

  it('requires an approved scoped board and normalizes before persistence', () => {
    expect(processor).toContain('normalizeMondayEvidenceEvent')
    expect(processor).toContain("scope.status = 'approved'")
    expect(processor).toContain('BETWEEN scope.period_start AND scope.period_end')
    expect(processor).toContain('hr_monday_evidence_events')
    expect(processor).toContain('ON CONFLICT (webhook_event_id) DO NOTHING')
  })
})
