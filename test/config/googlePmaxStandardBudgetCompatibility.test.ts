import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../server/database/migrations/350_google_pmax_budget_contract.sql',
  import.meta.url
)

describe('Google PMax Standard budget compatibility migration', () => {
  it('requires daily budget for Standard without using it as an Inventory total', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/value":"standard[\s\S]*action":"require[\s\S]*field_key = 'daily_budget'/)
    expect(sql).toContain('Daily Budget (Standard / legacy)')
    expect(sql).toContain('never converted into a total allocation')
    expect(sql).not.toMatch(/SET\s+allocated_total\s*=/i)
  })

  it('requires fixed-flight period only for Inventory', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/value":"inventory[\s\S]*action":"require[\s\S]*field_key = 'budget_period'/)
  })
})
