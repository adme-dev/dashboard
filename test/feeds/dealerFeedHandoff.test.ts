import { describe, expect, it } from 'vitest'
import { formatDealerFeedHandoffSummary } from '~~/app/utils/dealerFeedHandoff'

describe('formatDealerFeedHandoffSummary', () => {
  it('formats a Google feed workbook handoff with filters, store code, readiness, and issues', () => {
    const summary = formatDealerFeedHandoffSummary({
      clientName: 'Blood Hyundai',
      clientId: 'client-1',
      feedName: 'Google Blood Hyundai New Cars',
      platform: 'google',
      storeCode: 'BLOOD-HYUNDAI',
      workbookName: 'Blood Hyundai Feed Workbook',
      workbookUrl: '/agency/projects/project-1',
      workbookStatus: 'Open workbook',
      externalOrgId: 'org-1',
      sellerRefs: ['blood-hyundai'],
      filterChips: ['Condition: New', 'Make: Hyundai', 'Title: hybrid'],
      stockListMode: 'include',
      stockRefCount: 12,
      readiness: {
        status: 'partial',
        matchedTotal: 88,
        validatedTotal: 62,
        invalidTotal: 26,
        issueGroups: [
          { label: 'Missing URL', count: 20, fixMode: 'source_required' },
          { label: 'Description cleanup', count: 6, fixMode: 'ai_assisted' },
        ],
      },
      generatedFeedUrl: 'https://socials.driveagent.io/api/feeds/feed-1/serve',
    })

    expect(summary).toContain('Dealer Feed Handoff')
    expect(summary).toContain('- Client: Blood Hyundai')
    expect(summary).toContain('- Platform: Google Merchant')
    expect(summary).toContain('- Google store code: BLOOD-HYUNDAI')
    expect(summary).toContain('- Saleable inventory only: locked')
    expect(summary).toContain('- Stock list mode: Only listed stock')
    expect(summary).toContain('- Stock refs: 12')
    expect(summary).toContain('- Condition: New')
    expect(summary).toContain('- Status: Partial')
    expect(summary).toContain('- Matched vehicles: 88')
    expect(summary).toContain('- Feed-ready vehicles: 62')
    expect(summary).toContain('- Missing URL: 20 (Source fix)')
    expect(summary).toContain('- Description cleanup: 6 (AI assist)')
    expect(summary).toContain('https://socials.driveagent.io/api/feeds/feed-1/serve')
  })

  it('uses conservative defaults when no filters or feed URL are available', () => {
    const summary = formatDealerFeedHandoffSummary({
      clientName: 'Arctic Campers',
      platform: 'facebook',
      stockListMode: 'off',
    })

    expect(summary).toContain('- Feed: Draft feed')
    expect(summary).toContain('- Platform: Facebook Catalog')
    expect(summary).not.toContain('Google store code')
    expect(summary).toContain('- No campaign filter')
    expect(summary).toContain('- Stock list mode: No stock list')
    expect(summary).toContain('- Status: Checking')
    expect(summary).toContain('- Not generated yet')
  })
})
