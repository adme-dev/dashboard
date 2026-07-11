import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/utils/mondayMigration.ts', 'utf8')

describe('Monday migration idempotency contract', () => {
  it('reuses a task mapped in an earlier migration session', () => {
    expect(source).toContain('SELECT mim.task_id')
    expect(source).toContain('ORDER BY mim.updated_at DESC')
    expect(source).toContain('UPDATE tasks')
    expect(source).toContain('every rerun would create duplicate local tasks')
    expect(source).toContain('WHERE monday_update_id = $1 LIMIT 1')
    expect(source).toContain('WHERE monday_asset_id = $1 LIMIT 1')
  })

  it('supports incremental source cutoffs', () => {
    expect(source).toContain('updatedSince?: string')
    expect(source).toContain('this.config.updatedSince')
    expect(source).toContain('allItems = allItems.filter')
  })
})
