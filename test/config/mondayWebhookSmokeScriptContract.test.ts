import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
const source = readFileSync('scripts/test-monday-webhook.mjs', 'utf8')
describe('Monday webhook smoke script contract', () => {
  it('tests challenge and signed delivery twice for deduplication', () => {
    expect(source).toContain('challenge')
    expect(source).toContain('createHmac')
    expect(source).toContain('attempt < 2')
    expect(source).toContain('X-Apps-Event-Id')
  })
})
