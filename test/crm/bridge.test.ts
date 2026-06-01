import { describe, it, expect } from 'vitest'
import { buildCampaignBridgeInput } from '~~/server/utils/email-marketing/campaignSend'
import { buildLeadBridgeInput } from '~~/server/utils/leads/crmBridge'

// These two pure builders map a domain event (a campaign send / an inbound lead)
// onto the gated CRM communication bridge. They never touch the DB; the gate +
// person-lookup + idempotency live in bridgeCommunication().

describe('buildCampaignBridgeInput (email send → CRM timeline)', () => {
  const campaign = { id: 'camp-1', client_id: 'client-9', subject: 'Spring sale' }
  const recipient = { email: 'jo@acme.test', subscriber_id: 'sub-7' }

  it('maps an outbound email_bridge communication', () => {
    expect(buildCampaignBridgeInput(campaign, recipient)).toEqual({
      clientId: 'client-9',
      contactEmail: 'jo@acme.test',
      channel: 'email',
      direction: 'outbound',
      source: 'email_bridge',
      externalId: 'camp-1:sub-7',
      subject: 'Spring sale',
      body: null,
    })
  })

  it('uses a deterministic campaign:subscriber externalId (independent of Resend message id)', () => {
    expect(buildCampaignBridgeInput(campaign, { email: 'a@b.test', subscriber_id: 'sub-X' }).externalId)
      .toBe('camp-1:sub-X')
  })

  it('returns null when the campaign has no client_id (nothing to scope to)', () => {
    expect(buildCampaignBridgeInput({ id: 'c', client_id: null, subject: 's' }, recipient)).toBeNull()
  })

  it('returns null when the recipient email is empty', () => {
    expect(buildCampaignBridgeInput(campaign, { email: '', subscriber_id: 'sub-7' })).toBeNull()
  })

  it('carries a null subject through unchanged', () => {
    expect(buildCampaignBridgeInput({ id: 'c', client_id: 'cl', subject: null }, recipient).subject).toBeNull()
  })
})

describe('buildLeadBridgeInput (inbound lead → CRM timeline)', () => {
  const lead = {
    id: 'lead-1',
    client_id: 'client-9',
    field_data: { email: 'jo@acme.test', full_name: 'Jo' },
    submitted_at: '2026-06-02T10:00:00.000Z',
  }

  it('maps an inbound lead_bridge communication keyed by the lead id', () => {
    expect(buildLeadBridgeInput(lead)).toEqual({
      clientId: 'client-9',
      contactEmail: 'jo@acme.test',
      channel: 'note',
      direction: 'inbound',
      source: 'lead_bridge',
      externalId: 'lead-1',
      subject: 'New lead submission',
      body: null,
      occurredAt: '2026-06-02T10:00:00.000Z',
    })
  })

  it('returns null when the lead has no email in field_data', () => {
    expect(buildLeadBridgeInput({ id: 'l', client_id: 'c', field_data: { full_name: 'Jo' } })).toBeNull()
  })

  it('returns null when the lead has no client_id', () => {
    expect(buildLeadBridgeInput({ id: 'l', client_id: null, field_data: { email: 'a@b.test' } })).toBeNull()
  })

  it('tolerates missing/empty field_data', () => {
    expect(buildLeadBridgeInput({ id: 'l', client_id: 'c', field_data: undefined })).toBeNull()
    expect(buildLeadBridgeInput({ id: 'l', client_id: 'c', field_data: null })).toBeNull()
  })

  it('defaults occurredAt to null when submitted_at is absent', () => {
    expect(buildLeadBridgeInput({ id: 'l2', client_id: 'c', field_data: { email: 'a@b.test' } }).occurredAt).toBeNull()
  })
})
