import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pagePath = 'app/pages/agency/analytics/audiences/intelligence.vue'
const componentRoot = 'app/components/analytics/audiences/intelligence'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('automotive site intelligence page contract', () => {
  it('owns a viewport-bounded vertical scroll container inside the agency shell', () => {
    const page = source(pagePath)

    expect(page).toMatch(/<div class="[^"]*h-full[^"]*min-h-0[^"]*overflow-y-auto[^"]*"/)
  })

  it('composes the evidence-led page with independent resource states', () => {
    const page = source(pagePath)

    expect(page).toContain('layout: \'agency\'')
    expect(page).toContain('middleware: [\'role-media\']')
    expect(page).toContain('<AnalyticsSectionNav active="intelligence"')
    expect(page).toContain('<AnalyticsAudiencesIntelligenceCoverageSummary')
    expect(page).toContain('<AnalyticsAudiencesIntelligenceInsightFeed')
    expect(page).toContain('<AnalyticsAudiencesIntelligenceOfferGapTable')
    expect(page).toContain('<AnalyticsAudiencesIntelligenceChangeFeed')
    expect(page).toContain('<AnalyticsAudiencesIntelligenceRunDiagnostics')
    expect(page).toContain('<AnalyticsAudiencesIntelligenceDomainTable')
    expect(page).toContain('status.overview')
    expect(page).toContain('status.changes')
    expect(page).toContain('status.gaps')
    expect(page).toContain('errors.overview')
    expect(page).toContain('errors.changes')
    expect(page).toContain('errors.gaps')
  })

  it('distinguishes partial coverage, no domains, no runs, and no material insights', () => {
    const page = source(pagePath)

    expect(page).toContain('Partial collection coverage')
    expect(page).toContain('No monitored domains configured')
    expect(page).toContain('Collection has not started')
    expect(page).toContain('No material intelligence in this range')
    expect(page).toContain('blocked or disallowed')
    expect(page).not.toContain('bypass')
  })

  it('shows traceable source, confidence, origin, time, and before/after evidence', () => {
    const sources = [
      'InsightFeed.vue',
      'OfferGapTable.vue',
      'ChangeFeed.vue',
      'RunDiagnostics.vue'
    ].map(file => source(`${componentRoot}/${file}`)).join('\n')

    expect(sources).toContain('Deterministic')
    expect(sources).toContain('AI interpreted')
    expect(sources).toContain('confidence')
    expect(sources).toContain('observedAt')
    expect(sources).toContain('evidenceUrls')
    expect(sources).toContain('Before')
    expect(sources).toContain('After')
    expect(sources).toContain('target="_blank"')
    expect(sources).toContain('rel="noopener noreferrer"')
  })

  it('uses Nuxt UI controls and a confirmation modal for governed mutations', () => {
    const sources = [
      source(pagePath),
      source(`${componentRoot}/DomainTable.vue`),
      source(`${componentRoot}/DomainModal.vue`)
    ].join('\n')

    expect(sources).toContain('<UModal')
    expect(sources).toContain('<UButton')
    expect(sources).toContain('<USelectMenu')
    expect(sources).toContain('<UTable')
    expect(sources).not.toMatch(/\bconfirm\s*\(|\balert\s*\(|<input\b|<select\b|type=["']date["']/i)
  })

  it('keeps competitor evidence free of invented performance fields', () => {
    const sources = [
      source(pagePath),
      'CoverageSummary.vue',
      'InsightFeed.vue',
      'OfferGapTable.vue',
      'ChangeFeed.vue',
      'RunDiagnostics.vue'
    ].map(file => file.endsWith('.vue') && !file.includes('/') ? source(`${componentRoot}/${file}`) : file).join('\n')

    expect(sources).not.toMatch(/competitor(?:Visitors?|Audience|Conversions?|Reach|Spend|Traffic estimate)/i)
  })
})
