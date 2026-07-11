import { describe, expect, it } from 'vitest'
import { suggestHrRosterClassification } from '../../../../server/utils/hr/rosterClassification'

describe('HR roster classification suggestions', () => {
  it('flags generic and integration identities for owner review without deciding eligibility', () => {
    expect(suggestHrRosterClassification({ name: 'Meta App Reviewer', email: 'meta-reviewer@xeroflow.io', role: 'member' })).toMatchObject({
      suggestedClassification: 'service_account',
      reviewEligible: false,
    })
    expect(suggestHrRosterClassification({ name: 'Account Manager', email: 'am@agency.com', role: 'Account Manager' })).toMatchObject({
      suggestedClassification: 'shared_account',
      reviewEligible: false,
    })
  })

  it('keeps named identities pending human confirmation', () => {
    expect(suggestHrRosterClassification({ name: 'Matthew Crawford', email: 'matthew@adme.net.au', role: 'member' })).toEqual({
      suggestedClassification: 'person',
      reviewEligible: null,
      reason: 'Named account; confirm employment or contractor status before review eligibility.',
    })
  })
})
