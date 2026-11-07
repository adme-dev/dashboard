import { describe, expect, it } from 'vitest'
import { buildClientMutationPayload } from '~~/app/utils/clientMutationPayload'

const form = {
  name: 'Client', contactEmail: 'team@example.test', contactPhone: '123', reportingTimezone: 'Australia/Melbourne',
  billingType: 'project', paymentTerms: 30, retainerAmount: 500, hourlyRate: 100, mediaCommissionRate: 10, xeroContactId: 'private-id',
  notes: '', address: '', isActive: true, portalBoardId: null
}
describe('client form permission payload', () => {
  it('omits hidden financial defaults and unavailable admin fields while preserving contact edits', () => {
    expect(buildClientMutationPayload(form, false)).toEqual({ name: form.name, contactEmail: form.contactEmail, contactPhone: form.contactPhone, reportingTimezone: form.reportingTimezone })
  })
  it('allows account-manager client billing terms while omitting only company Xero binding', () => {
    const { xeroContactId: _xero, ...expected } = form
    expect(buildClientMutationPayload(form, true, false)).toEqual(expected)
    expect(buildClientMutationPayload(form, true, false, true)).toEqual({ name: form.name, contactEmail: form.contactEmail, contactPhone: form.contactPhone, reportingTimezone: form.reportingTimezone })
  })
  it('preserves the existing complete payload only with explicit Finance', () => {
    expect(buildClientMutationPayload(form, true, true)).toEqual(form)
  })
  it('never injects absent metadata fields into updates', () => {
    expect(buildClientMutationPayload({ contactPhone: 'updated', billingType: 'project' }, false)).toEqual({ contactPhone: 'updated' })
  })
})
