import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('agency knowledge chunk migration', () => {
  it('adds an explicit scope discriminator and permits only governed board or agency chunk ownership', () => {
    const sql = readFileSync('server/database/migrations/343_board_knowledge_agency_chunks.sql', 'utf8')

    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS scope_key/i)
    expect(sql).toMatch(/UPDATE ai_knowledge_chunks[\s\S]*'board:' \|\| department_id::text/i)
    expect(sql).toMatch(/ALTER COLUMN submission_id DROP NOT NULL/i)
    expect(sql).toMatch(/ALTER COLUMN department_id DROP NOT NULL/i)
    expect(sql).toMatch(/scope_key = 'agency'[\s\S]*submission_id IS NULL[\s\S]*department_id IS NULL/i)
    expect(sql).toMatch(/scope_key = 'board:' \|\| department_id::text[\s\S]*submission_id IS NOT NULL/i)
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_scope/i)
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i)
  })
})
