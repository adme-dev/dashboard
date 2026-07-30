import { describe, expect, it } from 'vitest'
import {
  CRM_EMAIL_DELIVERY_STATES,
  projectEmailDeliveryState,
  type CrmEmailEnvelope
} from '~~/server/utils/crm/emailContracts'

describe('CRM email delivery contracts', () => {
  it('keeps the canonical state list aligned with the database contract', () => {
    expect(CRM_EMAIL_DELIVERY_STATES).toEqual([
      'draft',
      'queued',
      'sending',
      'sent',
      'delivered',
      'deferred',
      'bounced',
      'failed',
      'rejected',
      'complained',
      'cancelled'
    ])
  })

  it('advances non-terminal delivery states', () => {
    expect(projectEmailDeliveryState('draft', 'queued'))
      .toEqual({ state: 'queued', changed: true })
    expect(projectEmailDeliveryState('queued', 'sending'))
      .toEqual({ state: 'sending', changed: true })
    expect(projectEmailDeliveryState('sent', 'delivered'))
      .toEqual({ state: 'delivered', changed: true })
    expect(projectEmailDeliveryState('sent', 'deferred'))
      .toEqual({ state: 'deferred', changed: true })
    expect(projectEmailDeliveryState('deferred', 'delivered'))
      .toEqual({ state: 'delivered', changed: true })
  })

  it('does not regress a delivered or terminal negative state', () => {
    expect(projectEmailDeliveryState('delivered', 'deferred'))
      .toEqual({ state: 'delivered', changed: false })
    expect(projectEmailDeliveryState('delivered', 'bounced'))
      .toEqual({ state: 'delivered', changed: false })
    expect(projectEmailDeliveryState('bounced', 'delivered'))
      .toEqual({ state: 'bounced', changed: false })
    expect(projectEmailDeliveryState('failed', 'failed'))
      .toEqual({ state: 'failed', changed: false })
    expect(projectEmailDeliveryState('complained', 'sent'))
      .toEqual({ state: 'complained', changed: false })
  })

  it('allows a recipient complaint to supersede delivery', () => {
    expect(projectEmailDeliveryState('delivered', 'complained'))
      .toEqual({ state: 'complained', changed: true })
  })

  it('accepts a terminal failure from any non-terminal state', () => {
    expect(projectEmailDeliveryState('queued', 'rejected'))
      .toEqual({ state: 'rejected', changed: true })
    expect(projectEmailDeliveryState('sent', 'bounced'))
      .toEqual({ state: 'bounced', changed: true })
    expect(projectEmailDeliveryState('deferred', 'failed'))
      .toEqual({ state: 'failed', changed: true })
  })

  it('defines an envelope without provider-specific payload fields', () => {
    const envelope: CrmEmailEnvelope = {
      direction: 'outbound',
      from: { address: 'sales@example.com', name: 'Sales' },
      to: [{ address: 'customer@example.net' }],
      cc: [],
      bcc: [],
      subject: 'Your enquiry',
      text: 'Thanks for your enquiry.',
      html: null,
      internetMessageId: '<message@example.com>',
      inReplyTo: null,
      references: [],
      occurredAt: '2026-07-30T00:00:00.000Z'
    }

    expect(envelope.to[0]?.address).toBe('customer@example.net')
    expect(envelope).not.toHaveProperty('cloudflare')
    expect(envelope).not.toHaveProperty('resend')
  })
})
