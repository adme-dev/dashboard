import { describe, expect, it } from 'vitest'
import { deriveCrmAccessPolicy } from '../../../../server/utils/leads/crmAccessPolicy'

describe('CRM access policy', () => {
  it('preserves capture while CRM is unavailable', () => {
    expect(deriveCrmAccessPolicy('full_crm', { 'crm.core': 'suspended' })).toMatchObject({
      captureLeads: true,
      promoteInternally: false,
      reason: 'crm_entitlement_inactive'
    })
  })

  it('separates internal and external CRM entitlements', () => {
    expect(deriveCrmAccessPolicy('lightweight_crm', { 'crm.core': 'active' }).promoteInternally).toBe(true)
    expect(deriveCrmAccessPolicy('external_crm', { 'crm.external': 'trial' }).deliverExternally).toBe(true)
  })
})
