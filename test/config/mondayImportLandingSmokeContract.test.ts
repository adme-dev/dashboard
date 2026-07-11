import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('scripts/check-monday-import-landing.mjs', 'utf8')

describe('Monday import landing smoke test', () => {
  it('compares source comments and files with the latest local item mapping', () => {
    expect(source).toContain('updates(limit: 100) { id }')
    expect(source).toContain('assets { id }')
    expect(source).toContain('DISTINCT ON (mim.monday_item_id)')
    expect(source).toContain('ORDER BY mim.monday_item_id, mim.updated_at DESC')
    expect(source).toContain('missingComments')
    expect(source).toContain('missingFiles')
  })

  it('distinguishes migration history from divergent task mappings', () => {
    expect(source).toContain('COUNT(DISTINCT task_id)')
    expect(source).toContain('divergentTaskMappings')
    expect(source).not.toContain('duplicateSourceMappings')
  })
})
