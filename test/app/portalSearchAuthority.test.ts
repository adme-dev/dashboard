import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../app/components/search-authority/PortalSummary.client.vue', import.meta.url),
  'utf8'
)
const pageSource = readFileSync(
  new URL('../../app/pages/portal/search-authority.vue', import.meta.url),
  'utf8'
)
const featureIndexSource = readFileSync(
  new URL('../../app/pages/features/index.vue', import.meta.url),
  'utf8'
)
const featureDetailSource = readFileSync(
  new URL('../../app/pages/features/[slug].vue', import.meta.url),
  'utf8'
)
const marketingNavSource = readFileSync(
  new URL('../../app/components/MarketingNav.vue', import.meta.url),
  'utf8'
)

describe('portal Search Authority copy contract', () => {
  it('keeps portal authentication and layout metadata on the route shell', () => {
    expect(pageSource).toContain('portal-auth')
    expect(pageSource).toContain('<SearchAuthorityPortalSummary />')
  })

  it('uses measured-fact language with unavailable and provisional states', () => {
    expect(source).toContain('Measured search visibility')
    expect(source).toContain('Provider provisional')
    expect(source).toContain('Search evidence unavailable')
    expect(source).toContain('Approved actions')
  })

  it('does not render private agency scoring or raw query evidence', () => {
    expect(source).not.toMatch(
      /queryText|reasonCodes|scoringVersion|connectionId|credential|baseline|Score \{\{/i
    )
  })
})

describe('public Search Authority feature contract', () => {
  it('links the feature from the index and marketing navigation', () => {
    expect(featureIndexSource).toContain('search-authority-ai-trust')
    expect(marketingNavSource).toContain('/features/search-authority-ai-trust')
  })

  it('publishes the four promised capability sections', () => {
    expect(featureDetailSource).toContain('Search Evidence')
    expect(featureDetailSource).toContain('Technical Trust')
    expect(featureDetailSource).toContain('Governed Content Workflow')
    expect(featureDetailSource).toContain('Transparent Measurement')
  })
})
