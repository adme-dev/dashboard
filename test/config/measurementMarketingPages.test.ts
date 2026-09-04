import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const featureIndex = readFileSync('app/pages/features/index.vue', 'utf8')
const featureDetail = readFileSync('app/pages/features/[slug].vue', 'utf8')
const marketingNav = readFileSync('app/components/MarketingNav.vue', 'utf8')

const stableSlug = 'measurement-signal-centre'

describe('measurement Signal Centre marketing surfaces', () => {
  it('uses one stable feature slug across the index, detail page, and mega menu', () => {
    expect(featureIndex).toContain(`slug: '${stableSlug}'`)
    expect(featureDetail).toContain(`'${stableSlug}': {`)
    expect(featureDetail).toContain(`slug: '${stableSlug}'`)
    expect(marketingNav).toContain(`to: '/features/${stableSlug}'`)
  })

  it('describes privacy-safe server-side measurement without outcome guarantees', () => {
    const publicCopy = [featureIndex, featureDetail, marketingNav].join('\n')

    expect(publicCopy).toMatch(/privacy-safe/i)
    expect(publicCopy).toMatch(/server-side measurement/i)
    expect(publicCopy).not.toMatch(/guarante(?:e|ed|es|eing) attribution/i)
    expect(publicCopy).not.toMatch(/guarante(?:e|ed|es|eing) (?:legal|regulatory) compliance/i)
  })
})
