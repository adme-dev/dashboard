import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = readFileSync(
  new URL('../../server/api/agency/hr/responsibilities/index.get.ts', import.meta.url),
  'utf8',
)

describe('HR responsibility map API contract', () => {
  it('is restricted, non-cacheable, audited, and derived from published active roles', () => {
    expect(route).toContain('requireHrAdmin(event)')
    expect(route).toContain("'Cache-Control', 'private, no-store'")
    expect(route).toContain("action: 'responsibility_map.viewed'")
    expect(route).toContain("version.status = 'published'")
    expect(route).toContain("profile.status = 'active'")
  })
})
