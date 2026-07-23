import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  normalizePodiumWebhookEvent,
  verifyPodiumWebhookSignature
} from '../../../../server/utils/leads/providers/podium'

const SECRET = 'podium-webhook-secret'
const NOW = 1_784_803_200_000

function signature(rawBody: string, timestamp: string): string {
  return createHmac('sha256', SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
}

function messageEvent(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      uid: 'message-1',
      body: 'I would like to book a test drive.',
      createdAt: '2026-07-23T10:00:00.000Z',
      webchatUrl: 'https://www.southmorangmotorgroup.com.au/vehicles/rav4?utm_source=meta&utm_medium=paid_social&utm_campaign=winter-rav4&fbclid=fb-1',
      contact: {
        uid: 'contact-1',
        name: 'Jane Citizen'
      },
      conversation: {
        uid: 'conversation-1',
        channel: {
          type: 'phone',
          identifier: '+61400123456'
        }
      },
      location: {
        uid: 'location-1',
        organizationUid: 'organization-1'
      },
      ...overrides
    },
    metadata: {
      eventType: 'message.received',
      eventUid: 'event-1',
      version: '2021.04.01'
    }
  }
}

describe('Podium webhook adapter', () => {
  it('verifies Podium HMAC signatures over timestamp.raw_body', () => {
    const rawBody = JSON.stringify(messageEvent())
    const timestamp = String(NOW)

    expect(verifyPodiumWebhookSignature({
      rawBody,
      timestamp,
      signature: signature(rawBody, timestamp),
      secret: SECRET,
      nowMs: NOW
    })).toBe(true)
  })

  it('rejects tampered and stale signed payloads', () => {
    const rawBody = JSON.stringify(messageEvent())
    const timestamp = String(NOW)
    const signed = signature(rawBody, timestamp)

    expect(verifyPodiumWebhookSignature({
      rawBody: `${rawBody} `,
      timestamp,
      signature: signed,
      secret: SECRET,
      nowMs: NOW
    })).toBe(false)

    expect(verifyPodiumWebhookSignature({
      rawBody,
      timestamp,
      signature: signed,
      secret: SECRET,
      nowMs: NOW + 10 * 60_000
    })).toBe(false)
  })

  it('normalizes a confirmed webchat message into the universal lead contract', () => {
    expect(normalizePodiumWebhookEvent(messageEvent())).toEqual({
      status: 'accepted',
      lead: {
        sourceLeadId: 'podium:event-1',
        formId: 'podium-webchat',
        formName: 'Podium Webchat',
        submittedAt: '2026-07-23T10:00:00.000Z',
        webchatUrl: expect.stringContaining('southmorangmotorgroup.com.au'),
        organizationUid: 'organization-1',
        locationUid: 'location-1',
        fieldData: expect.objectContaining({
          full_name: 'Jane Citizen',
          first_name: 'Jane',
          last_name: 'Citizen',
          phone_number: '+61400123456',
          lead_provider: 'podium',
          podium_contact_uid: 'contact-1',
          podium_conversation_uid: 'conversation-1',
          podium_message_uid: 'message-1',
          podium_location_uid: 'location-1',
          podium_channel_type: 'phone',
          podium_webchat_url: expect.stringContaining('southmorangmotorgroup.com.au'),
          message: 'I would like to book a test drive.'
        }),
        attribution: {
          utm_source: 'meta',
          utm_medium: 'paid_social',
          utm_campaign: 'winter-rav4',
          fbclid: 'fb-1'
        }
      }
    })
  })

  it('maps an email conversation channel without inventing a phone number', () => {
    const result = normalizePodiumWebhookEvent(messageEvent({
      conversation: {
        uid: 'conversation-2',
        channel: { type: 'email', identifier: 'JANE@EXAMPLE.COM' }
      }
    }))

    expect(result.status).toBe('accepted')
    if (result.status === 'accepted') {
      expect(result.lead.fieldData.email).toBe('jane@example.com')
      expect(result.lead.fieldData).not.toHaveProperty('phone_number')
    }
  })

  it('accepts blank optional contact fields without dropping the event', () => {
    const result = normalizePodiumWebhookEvent(messageEvent({
      contactName: '',
      contact: { uid: 'contact-1', name: '', externalIdentifier: '' }
    }))

    expect(result.status).toBe('accepted')
    if (result.status === 'accepted') {
      expect(result.lead.fieldData).not.toHaveProperty('full_name')
      expect(result.lead.fieldData.phone_number).toBe('+61400123456')
    }
  })

  it('ignores outbound messages and non-webchat conversations', () => {
    expect(normalizePodiumWebhookEvent({
      ...messageEvent(),
      metadata: { eventType: 'message.sent', eventUid: 'event-2' }
    })).toEqual({ status: 'ignored', reason: 'event_type' })

    expect(normalizePodiumWebhookEvent(messageEvent({ webchatUrl: undefined })))
      .toEqual({ status: 'ignored', reason: 'not_webchat' })
  })

  it('rejects non-web webchat URLs before origin matching', () => {
    expect(normalizePodiumWebhookEvent(messageEvent({
      webchatUrl: 'javascript:alert(1)'
    }))).toEqual({ status: 'invalid', reason: 'payload' })
  })
})
