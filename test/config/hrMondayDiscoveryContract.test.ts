import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('server/api/agency/hr/monday/discovery.get.ts', 'utf8')

describe('HR Monday discovery manifest contract', () => {
  it('is owner-only and read-only', () => {
    expect(source).toContain('requireHrAdmin(event)')
    expect(source).toContain('Read-only discovery; no records are imported')
    expect(source).toContain('getItems(board.id')
  })
  it('reports mapping inputs without exposing raw payloads', () => {
    expect(source).toContain('groups: detail?.groups')
    expect(source).toContain('columnValueTypes')
    expect(source).not.toContain('source_data')
  })
})
