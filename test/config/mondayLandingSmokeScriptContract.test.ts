import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('scripts/check-monday-import-landing.mjs', 'utf8')
describe('Monday landing smoke harness contract', () => {
  it('uses a bounded read-only board sample and checks local mappings', () => {
    expect(source).toContain('items_page(limit: 100)')
    expect(source).toContain('monday_item_mappings')
    expect(source).toContain('task_exists')
    expect(source).toContain('brokenCompletedMappings')
  })
})
