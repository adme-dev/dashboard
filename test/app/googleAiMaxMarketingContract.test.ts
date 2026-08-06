import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const index = readFileSync('app/pages/features/index.vue', 'utf8')
const detail = readFileSync('app/pages/features/[slug].vue', 'utf8')
const nav = readFileSync('app/components/MarketingNav.vue', 'utf8')

describe('Google AI Max marketing contract', () => {
  it('lists the shipped read-only readiness feature', () => {
    expect(index).toContain("slug: 'google-ai-max-readiness'")
    expect(index).toContain('read-only')
  })

  it('describes portfolio evidence and governance without claiming provider writes', () => {
    expect(detail).toContain("'google-ai-max-readiness':")
    expect(detail).toContain('Portfolio Migration Audit')
    expect(detail).toContain('Evidence, Not Guesswork')
    expect(detail).toContain('Read-Only by Design')
    expect(detail).toContain('Measurement Comes Next')
    expect(detail).not.toContain('XeroFlow automatically enables AI Max')
  })

  it('makes the feature discoverable from the financial operations mega menu', () => {
    expect(nav).toContain("to: '/features/google-ai-max-readiness'")
  })
})
