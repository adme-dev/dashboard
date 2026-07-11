export type HrRosterClassification = 'person' | 'shared_account' | 'service_account' | 'test_account' | 'external_contact'

type RosterIdentity = { name: string; email: string; role?: string | null }

export function suggestHrRosterClassification(identity: RosterIdentity): {
  suggestedClassification: HrRosterClassification
  reviewEligible: boolean | null
  reason: string
} {
  const searchable = `${identity.name} ${identity.email}`.toLowerCase()
  if (/\b(test|demo|reviewer|integration|bot|automation)\b/.test(searchable)) {
    return {
      suggestedClassification: 'service_account',
      reviewEligible: false,
      reason: 'Account name indicates an integration, reviewer, automation, or test identity.',
    }
  }
  const emailLocal = identity.email.split('@')[0]?.toLowerCase() || ''
  const genericMailbox = /^(accounts?|admin|advertising|am|copy|creative|designer|info|media|operations?|production|support)$/
  if (genericMailbox.test(emailLocal) || /^(account manager|copywriter|creative director|junior designer|media buyer|senior designer)$/i.test(identity.name.trim())) {
    return {
      suggestedClassification: 'shared_account',
      reviewEligible: false,
      reason: 'Generic role name or mailbox; confirm whether a real individual uses this account.',
    }
  }
  return {
    suggestedClassification: 'person',
    reviewEligible: null,
    reason: 'Named account; confirm employment or contractor status before review eligibility.',
  }
}
