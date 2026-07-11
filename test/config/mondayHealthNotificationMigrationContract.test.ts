import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('server/database/migrations/231_monday_health_notifications.sql', 'utf8')
const sourceLinks = readFileSync('server/database/migrations/233_monday_item_source_links.sql', 'utf8')
describe('Monday health notification migration contract', () => {
  it('does not reject existing notification types', () => {
    expect(source).toContain('DROP CONSTRAINT IF EXISTS notifications_type_check')
    expect(source).not.toContain('ADD CONSTRAINT notifications_type_check')
  })

  it('formalizes source state and indexes canonical task lookups', () => {
    expect(sourceLinks).toContain('ADD COLUMN IF NOT EXISTS monday_board_id')
    expect(sourceLinks).toContain('ADD COLUMN IF NOT EXISTS archived')
    expect(sourceLinks).toContain('(task_id, updated_at DESC)')
    expect(sourceLinks).toContain("WHERE task_id IS NOT NULL AND status = 'completed'")
  })
})
