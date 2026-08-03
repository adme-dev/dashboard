import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildReviewedPmaxSuggestion } from '~~/server/utils/searchAuthority/opportunities'

describe('Search Authority reporting contract', () => {
  it('returns a review-only PMax brief and never claims a mutation or Quality Score change', () => {
    const suggestion = buildReviewedPmaxSuggestion({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Cannon Alpha towing demand',
      summary: 'Customers are searching for towing capability guidance.',
      queryText: 'cannon alpha towing capacity',
      pageUrl: 'https://www.knoxgwmhaval.com.au/models/cannon-alpha',
      evidenceStartDate: '2026-05-01',
      evidenceEndDate: '2026-07-31'
    })

    expect(suggestion.reviewState).toBe('review_required')
    expect(suggestion.mutationPerformed).toBe(false)
    expect(suggestion.taskPayload.sourceEvidence.query).toBe('cannon alpha towing capacity')
    expect(JSON.stringify(suggestion)).not.toMatch(/quality score improvement/i)
  })

  it('keeps agency and portal routes tenant-scoped and raw queries out of the portal response', () => {
    const agency = readFileSync('server/api/agency/search-authority/reporting/overview.get.ts', 'utf8')
    const portal = readFileSync('server/api/portal/search-authority/reporting.get.ts', 'utf8')
    expect(agency).toContain('requireAgencySearchAuthorityAccess')
    expect(agency).toContain('buildReviewedPmaxSuggestion')
    expect(agency).not.toMatch(/googleAds|mutateCampaign|assetGroupOperation/)
    expect(portal).toContain('requirePortalSearchAuthorityAccess')
    expect(portal).not.toContain('query_text')
  })
})
