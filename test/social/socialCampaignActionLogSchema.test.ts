import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mig = (f: string) =>
  readFileSync(resolve(__dirname, '../../server/database/migrations', f), 'utf8')

describe('social campaign action log migrations', () => {
  it('adds an index for active AI pacing budget recommendations', () => {
    const sql = mig('178_social_campaign_action_log_active_index.sql')

    expect(sql).toContain('idx_campaign_action_log_active_ai_pacing_budget')
    expect(sql).toContain('media_spend_id')
    expect(sql).toContain("(new_value->>'dailyBudget')::numeric")
    expect(sql).toContain("metadata->>'source' = 'ai_pacing_review'")
    expect(sql).toContain("action_status IN ('planned', 'approved')")
  })
})
