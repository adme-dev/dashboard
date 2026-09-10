import { describe, expect, it } from 'vitest'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

describe('createPageStudioSetupProposal', () => {
  it('combines starter defaults with modules inferred from the brief', () => {
    const proposal = createPageStudioSetupProposal({
      businessName: 'Northside Supply', starterVersion: 'retail-v1', setupSource: 'chat',
      setupBrief: 'We need delivery, stock management and online checkout.'
    })
    expect(proposal.modules).toEqual(expect.arrayContaining(['catalogue', 'inventory', 'orders', 'delivery']))
    expect(proposal.collections).toEqual(expect.arrayContaining(['products', 'inventory']))
    expect(proposal.requiresAgencyReview).toBe(true)
    expect(proposal.missingFacts).toEqual(expect.arrayContaining([
      'business contact details',
      'product names, prices and availability'
    ]))
  })

  it.each([
    'Phone 03 9000 0000, email hello@example.com. We operate 24 hours in Melbourne with calendar availability. Rates start at $200 with a two-hour minimum hire.',
    'Still unconfirmed: approved phone and booking-recipient email; approved rates, minimum hire and surcharges; operating hours/timezone and availability; service area list. Leave these unset and retain them for client confirmation.'
  ])('retains launch confirmation topics regardless of unverified brief text: %s', (setupBrief) => {
    const proposal = createPageStudioSetupProposal({
      businessName: 'City Cars', starterVersion: 'limousine-v1', setupSource: 'chat',
      setupBrief
    })
    expect(proposal.missingFacts).toEqual([
      'business contact details',
      'service area or delivery locations',
      'booking hours, timezone and availability rules',
      'approved rates and minimum hire rules',
      'enquiry notification recipient'
    ])
  })
})
