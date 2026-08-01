import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  siteIntelligenceFiltersFromQuery,
  siteIntelligencePresetRange,
  siteIntelligenceQueryParams
} from '../../app/composables/useSiteIntelligence'

describe('site intelligence route state', () => {
  it('serialises only shareable client, date, lane, and feed filters', () => {
    expect(siteIntelligenceQueryParams({
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: '11111111-1111-4111-8111-111111111111',
      lane: 'competitor',
      changeType: 'facts_changed'
    })).toEqual({
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: '11111111-1111-4111-8111-111111111111',
      lane: 'competitor',
      changeType: 'facts_changed'
    })
  })

  it('omits all-lane and all-change sentinels and builds an inclusive 30-day range', () => {
    expect(siteIntelligenceQueryParams({
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: null,
      lane: 'all',
      changeType: 'all'
    })).toEqual({ from: '2026-07-03', to: '2026-08-01' })
    expect(siteIntelligencePresetRange(30, new Date('2026-08-01T12:00:00+10:00')))
      .toEqual({ from: '2026-07-03', to: '2026-08-01' })
  })

  it('restores filters from browser navigation and rejects unknown values', () => {
    expect(siteIntelligenceFiltersFromQuery({
      from: ['2026-07-03'],
      to: '2026-08-01',
      clientId: '11111111-1111-4111-8111-111111111111',
      lane: 'competitor',
      changeType: 'unknown'
    }, { from: '2026-06-01', to: '2026-06-30' })).toEqual({
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: '11111111-1111-4111-8111-111111111111',
      lane: 'competitor',
      changeType: 'all'
    })
  })
})

describe('site intelligence navigation', () => {
  it('adds a route-backed analytics destination and preserves shared audience filters', () => {
    const nav = readFileSync('app/components/analytics/AnalyticsSectionNav.vue', 'utf8')
    const audiencePage = readFileSync('app/pages/agency/analytics/audiences/index.vue', 'utf8')
    const intelligencePage = readFileSync('app/pages/agency/analytics/audiences/intelligence.vue', 'utf8')

    expect(nav).toContain('key: \'intelligence\'')
    expect(nav).toContain('path: \'/agency/analytics/audiences/intelligence\'')
    expect(nav).toContain('sharedAudienceQuery')
    expect(audiencePage).toContain('<AnalyticsSectionNav active="audiences" :query="$route.query" />')
    expect(intelligencePage).toContain('<AnalyticsSectionNav active="intelligence"')
  })

  it('fetches overview before starting independent change and gap requests', () => {
    const composable = readFileSync('app/composables/useSiteIntelligence.ts', 'utf8')

    expect(composable).toContain('await refreshOverview')
    expect(composable).toContain('Promise.allSettled')
    expect(composable).toContain('refreshChanges')
    expect(composable).toContain('refreshGaps')
    expect(composable).toContain('activeController?.abort()')
    expect(composable).not.toContain('overview.value = null')
  })
})
