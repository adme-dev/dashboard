import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('app/pages/agency/hr/monday/index.vue', 'utf8')

describe('HR Monday permission disclosure UI', () => {
  it('shows the effective connection and permissions before scope approval', () => {
    expect(source).toContain("'/api/agency/hr/monday/readiness'")
    expect(source).toContain('Connection permissions')
    expect(source).toContain('readiness.connection.requestedPermissions')
    expect(source).toContain('Review these permissions before approving')
  })
})
