import { describe, expect, it } from 'vitest'
import {
  deriveLeadHealthIssues,
  type LeadHealthSnapshot
} from '../../../../server/utils/leads/leadHealth'

function snapshot(overrides: Partial<LeadHealthSnapshot> = {}): LeadHealthSnapshot {
  return {
    formSubmits: 10,
    confirmedLeads: 5,
    providerNativeLeads: 2,
    websiteConfirmedLeads: 3,
    crmLinkedLeads: 5,
    campaignAttributedLeads: 5,
    browserLinkedLeads: 3,
    firstTouchLeads: 3,
    lastTouchLeads: 3,
    unmatchedSubmissions: 0,
    promotionFailures: 0,
    promotionPending: 0,
    contactedLeads: 2,
    qualifiedLeads: 1,
    wonLeads: 1,
    lostLeads: 0,
    wonValue: 42000,
    avgResponseMinutes: 12,
    lastSubmissionAt: null,
    lastConfirmedAt: null,
    unmatched: [],
    failedPromotions: [],
    ...overrides
  }
}

describe('lead integration health', () => {
  it('does not require browser IDs for Meta and Google native lead forms', () => {
    const issues = deriveLeadHealthIssues(snapshot(), 'full_crm')
    expect(issues.map(issue => issue.code)).not.toContain('browser_linkage_low')
  })

  it('reports only missing website lead links against the website denominator', () => {
    const issues = deriveLeadHealthIssues(
      snapshot({ browserLinkedLeads: 2 }),
      'full_crm'
    )
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'browser_linkage_low',
      message: expect.stringContaining('1 website lead')
    }))
  })

  it('surfaces durable CRM failures and stale unmatched submissions', () => {
    const issues = deriveLeadHealthIssues(snapshot({
      unmatchedSubmissions: 2,
      promotionFailures: 1,
      crmLinkedLeads: 4
    }), 'full_crm')

    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'unmatched_submissions',
      'crm_promotion_failed',
      'crm_delivery_gap'
    ]))
  })
})
