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
  })
})
