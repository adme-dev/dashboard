import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('news recommendation contract', () => {
  it('uses client-scoped access, profile, performance, and optimal slots', () => {
    const source = readFileSync('server/api/agency/social/news/recommendations.get.ts', 'utf8')
    expect(source).toContain('requireSocialClientAccess(event, clientId)')
    expect(source).toContain('social_news_client_profiles')
    expect(source).toContain('social_post_metrics')
    expect(source).toContain('social_news_items')
    expect(source).toContain('matchedKeywords')
    expect(source).toContain("health: account.last_error ? 'error'")
    expect(source).toContain('engagements / impressions')
    expect(source).toContain('nextOptimalSlots')
    expect(source).toContain('approvalRequired: true')
  })

  it('exposes the recommendation preview in the news draft flow', () => {
    const source = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')
    expect(source).toContain('AI planning inputs')
    expect(source).toContain('account.health')
  })

  it('exposes package constraints before news drafting', () => {
    const source = readFileSync('app/pages/agency/social/publishing/news.vue', 'utf8')
    expect(source).toContain('Included')
    expect(source).toContain('Overage:')
    expect(source).toContain('Approval SLA:')
  })
})
