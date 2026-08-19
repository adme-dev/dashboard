import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('MCP ad performance creative migration', () => {
  it('adds durable creative identity to ad performance snapshots', () => {
    const sql = readFileSync('server/database/migrations/387_ad_performance_creative_identity.sql', 'utf8')
    expect(sql).toMatch(/ALTER TABLE ad_performance_snapshots/i)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS creative_id TEXT/i)
  })
})
