import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mig = (f: string) =>
  readFileSync(resolve(__dirname, '../../server/database/migrations', f), 'utf8')

describe('social campaign action log migrations', () => {
  it('declares typed cancellation audit columns', () => {
    const createSql = mig('177_social_campaign_action_log.sql')
    const alterSql = mig('178_social_campaign_action_log_active_index.sql')

    expect(createSql).toContain('cancelled_by UUID REFERENCES team_members(id) ON DELETE SET NULL')
    expect(createSql).toContain('cancelled_at TIMESTAMPTZ')
    expect(alterSql).toContain('ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES team_members(id) ON DELETE SET NULL')
    expect(alterSql).toContain('ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ')
  })

  it('adds an index for active AI pacing budget recommendations', () => {
    const sql = mig('178_social_campaign_action_log_active_index.sql')

    expect(sql).toContain('idx_campaign_action_log_active_ai_pacing_budget')
    expect(sql).toContain('media_spend_id')
    expect(sql).toContain("(new_value->>'dailyBudget')::numeric")
    expect(sql).toContain("metadata->>'source' = 'ai_pacing_review'")
    expect(sql).toContain("action_type = 'budget_update'")
    expect(sql).toContain("action_status IN ('planned', 'approved')")
  })

  it('adds an index for per-campaign action history lifecycle ordering', () => {
    const sql = mig('178_social_campaign_action_log_active_index.sql')

    expect(sql).toContain('idx_campaign_action_log_media_spend_lifecycle')
    expect(sql).toContain('media_spend_id')
    expect(sql).toContain('COALESCE(executed_at, cancelled_at, approved_at, requested_at) DESC')
  })
})
