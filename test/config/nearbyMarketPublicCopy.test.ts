import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (path: string) => {
  const url = new URL(`../../${path}`, import.meta.url)
  return existsSync(url) ? readFileSync(url, 'utf8') : ''
}
const privacy = source('app/pages/privacy.vue')
const terms = source('app/pages/terms.vue')
const catalogue = source('app/pages/features/index.vue')
const detail = source('app/pages/features/[slug].vue')
const nav = source('app/components/MarketingNav.vue')
const portal = source('app/pages/portal/features.vue')
const runbook = source('docs/runbooks/nearby-automotive-market.md')

describe('nearby market legal and product copy', () => {
  it('discloses Google processing, transient display data, Place-ID persistence, and applicable terms', () => {
    expect(privacy).toMatch(/Google Maps and Places/i)
    expect(privacy).toMatch(/transient/i)
    expect(privacy).toMatch(/Place ID/i)
    expect(privacy).toContain('https://policies.google.com/privacy')
    expect(terms).toMatch(/Google Maps Platform Terms/i)
    expect(terms).toMatch(/misuse/i)
  })

  it('describes bounded, human-governed discovery on every product surface', () => {
    for (const copy of [catalogue, detail, nav, portal]) {
      expect(copy).toMatch(/nearby/i)
      expect(copy).toMatch(/dealership/i)
      expect(copy).toMatch(/review|approval/i)
    }
    expect(`${catalogue}\n${detail}`).toMatch(/up to 20/i)
    expect(`${catalogue}\n${detail}`).toMatch(/non-exhaustive/i)
    expect(detail).toMatch(/never (?:claims?|infers?).*(?:traffic|audience|conversion|spend)/i)
  })

  it('documents dormant pilot controls and all operational gates', () => {
    for (const phrase of [
      'NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY',
      'NUXT_PUBLIC_GOOGLE_MAPS_MAP_ID',
      'GOOGLE_PLACES_SERVER_API_KEY',
      'NEARBY_MARKET_DISCOVERY_ENABLED',
      'Maps JavaScript API',
      'Places API (New)',
      'Knox',
      'Lilydale',
      'canNominateCompetitors',
      'Browser Rendering - Edit',
      'terminal'
    ]) expect(runbook).toContain(phrase)

    expect(runbook).toMatch(/production origins?/i)
    expect(runbook).toMatch(/preview origins?/i)
    expect(runbook).toMatch(/quota/i)
    expect(runbook).toMatch(/budget/i)
    expect(runbook).toMatch(/alert/i)
    expect(runbook).toMatch(/readiness/i)
    expect(runbook).toMatch(/monitor/i)
    expect(runbook).toMatch(/disable nearby discovery[\s\S]*revoke[\s\S]*pause site-intelligence crawling/i)
  })
})
