import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexSource = readFileSync('app/pages/features/index.vue', 'utf8')
const detailSource = readFileSync('app/pages/features/[slug].vue', 'utf8')

describe('public Website Audience Intelligence feature copy', () => {
  it('publishes the feature in Analytics & Reporting with its canonical slug', () => {
    expect(indexSource).toContain("title: 'Website Audience Intelligence'")
    expect(indexSource).toContain("slug: 'website-audience-intelligence'")
    expect(indexSource).toContain("icon: 'i-lucide-radio-tower'")
  })

  it('explains tracking health, audience quality, client comparison, and grounded AI', () => {
    const start = detailSource.indexOf("'website-audience-intelligence': {")
    const end = detailSource.indexOf("\n  '", start + 1)
    const feature = detailSource.slice(start, end === -1 ? undefined : end)

    expect(start).toBeGreaterThan(-1)
    expect(feature).toContain("title: 'Know every tag is talking'")
    expect(feature).toContain("title: 'Read audience quality'")
    expect(feature).toContain("title: 'Compare clients on one ledger'")
    expect(feature).toContain("title: 'Ask with the evidence attached'")
    expect(feature.toLowerCase()).toContain('aggregate')
    expect(feature.toLowerCase()).toContain('read-only')
    expect(feature).not.toMatch(/visitor identit|automatically changes? campaigns?|activates? (meta|google) audiences?/i)
  })
})
