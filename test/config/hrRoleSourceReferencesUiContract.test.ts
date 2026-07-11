import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../app/pages/agency/hr/roles.vue', import.meta.url), 'utf8')

describe('HR role source-reference UI contract', () => {
  it('provides a scroll-safe source ledger with explicit scope and limitations', () => {
    expect(page).toContain('Role source register')
    expect(page).toContain('addSourceReference')
    expect(page).toContain('removeSourceReference')
    expect(page).toContain('source.evidenceScope')
    expect(page).toContain('source.limitation')
    expect(page).toContain('sourceReferences: form.sourceReferences')
    expect(page).toContain('max-h-[calc(100vh-190px)]')
  })

  it('does not present Monday workflow metadata as contractual proof', () => {
    expect(page).toContain('does not prove performance or contractual ownership')
  })
})
