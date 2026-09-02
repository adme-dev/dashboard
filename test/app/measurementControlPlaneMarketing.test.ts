import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexPage = readFileSync(new URL('../../app/pages/features/index.vue', import.meta.url), 'utf8')
const detailPage = readFileSync(new URL('../../app/pages/features/[slug].vue', import.meta.url), 'utf8')
const navigation = readFileSync(new URL('../../app/components/MarketingNav.vue', import.meta.url), 'utf8')

describe('measurement control plane marketing contract', () => {
  it('keeps the feature catalogue, detail page, and navigation in sync', () => {
    expect(indexPage).toContain('slug: \'measurement-control-plane\'')
    expect(detailPage).toContain('\'measurement-control-plane\':')
    expect(navigation).toContain('to: \'/features/measurement-control-plane\'')
  })

  it('describes account, evidence, call, and freshness boundaries honestly', () => {
    expect(detailPage).toContain('Measurement is desired on when a new client is added')
    expect(detailPage).toContain('Existing clients enter review instead of receiving blind bulk activation')
    expect(detailPage).toContain('ambiguous names stop for operator review')
    expect(detailPage).toContain('browser Google Ads delivery remains observable')
    expect(detailPage).toContain('successful empty Google sync is labelled as no calls returned')
    expect(detailPage).toContain('requested, covered, and missing date ranges')
  })
})
