import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pagePath = 'app/pages/agency/analytics/audiences.vue'
const componentRoot = 'app/components/analytics/audiences'

describe('website audience intelligence page contract', () => {
  it('composes every deterministic evidence panel with agency media access', () => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).toContain('layout: \'agency\'')
    expect(source).toContain('middleware: [\'role-media\']')
    expect(source).toContain('<AnalyticsSectionNav active="audiences" />')
    expect(source).toContain('<AnalyticsAudiencesFilterBar')
    expect(source).toContain('<AnalyticsAudiencesSignalRibbon')
    expect(source).toContain('<AnalyticsAudiencesKpiGrid')
    expect(source).toContain('<AnalyticsAudiencesTrendChart')
    expect(source).toContain('<AnalyticsAudiencesOpportunityGrid')
    expect(source).toContain('<AnalyticsAudiencesBreakdownPanel')
    expect(source).toContain('<AnalyticsAudiencesClientTable')
  })

  it('keeps overview, timeseries, and breakdown failures independent', () => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).toContain('errors.overview')
    expect(source).toContain('errors.timeseries')
    expect(source).toContain('errors.breakdowns')
    expect((source.match(/<UAlert/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('links aggregate client rows to tracking diagnostics without exposing visitor identifiers', () => {
    const clientTable = readFileSync(`${componentRoot}/ClientTable.vue`, 'utf8')
    const allSources = [
      readFileSync(pagePath, 'utf8'),
      ...[
        'SignalRibbon.vue',
        'KpiGrid.vue',
        'TrendChart.client.vue',
        'OpportunityGrid.vue',
        'BreakdownPanel.vue',
        'ClientTable.vue'
      ].map(file => readFileSync(`${componentRoot}/${file}`, 'utf8'))
    ].join('\n')

    expect(clientTable).toContain('`/agency/tracking/${clientRow(row).clientId}`')
    expect(allSources).not.toMatch(/anonymous[_-]?id|session[_-]?id|click[_-]?id|fingerprint|email|phone/i)
  })

  it('uses Nuxt UI data components and no native form controls', () => {
    const source = [
      readFileSync(pagePath, 'utf8'),
      readFileSync(`${componentRoot}/TrendChart.client.vue`, 'utf8'),
      readFileSync(`${componentRoot}/BreakdownPanel.vue`, 'utf8'),
      readFileSync(`${componentRoot}/ClientTable.vue`, 'utf8')
    ].join('\n')

    expect(source).toContain('<USelectMenu')
    expect(source).toContain('<UTable')
    expect(source).not.toMatch(/<input\b|<select\b|type=["']date["']/i)
  })
})
