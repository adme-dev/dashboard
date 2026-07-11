import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('server/api/agency/monday/health.get.ts', 'utf8')

describe('Monday work health dashboard contract', () => {
  it('only reports active, non-archived imported work', () => {
    expect(source).toContain('NOT t.status_is_final')
    expect(source).toContain('NOT COALESCE(mim.archived, false)')
  })
})
