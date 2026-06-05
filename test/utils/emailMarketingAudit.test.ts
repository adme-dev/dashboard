import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consentEventParams,
  recordConsentEvent,
  recordSuppressionEvent,
  suppressionEventParams
} from '~~/server/utils/email-marketing/audit'

const executeMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => executeMock(...args)
}))

describe('email marketing audit helpers', () => {
  beforeEach(() => {
    executeMock.mockReset()
  })

  it('normalizes consent event params with empty metadata by default', () => {
    expect(consentEventParams({
      email: 'Paul@ADME.net.au',
      eventType: 'form_submitted',
      source: 'form'
    })).toEqual([
      null,
      'Paul@ADME.net.au',
      null,
      null,
      'form_submitted',
      'form',
      null,
      null,
      null,
      '{}'
    ])
  })

  it('records consent events with subscriber, list, actor, request, and metadata context', async () => {
    executeMock.mockResolvedValueOnce(1)

    await recordConsentEvent({
      subscriberId: 'sub-1',
      email: 'person@example.com',
      listId: 'list-1',
      campaignId: 'camp-1',
      eventType: 'confirmed',
      source: 'form',
      actorUserId: 'user-1',
      ipAddress: '203.0.113.10',
      userAgent: 'Vitest',
      metadata: { token: 'confirmed' }
    })

    expect(executeMock).toHaveBeenCalledTimes(1)
    const [sql, params] = executeMock.mock.calls[0]
    expect(String(sql)).toContain('INSERT INTO email_consent_events')
    expect(params).toEqual([
      'sub-1',
      'person@example.com',
      'list-1',
      'camp-1',
      'confirmed',
      'form',
      'user-1',
      '203.0.113.10',
      'Vitest',
      '{"token":"confirmed"}'
    ])
  })

  it('normalizes suppression event params with empty metadata by default', () => {
    expect(suppressionEventParams({
      email: 'person@example.com',
      reason: 'hard_bounce',
      action: 'added',
      source: 'webhook'
    })).toEqual([
      'person@example.com',
      null,
      null,
      'hard_bounce',
      'added',
      'webhook',
      null,
      '{}'
    ])
  })

  it('records suppression events with reason, action, source, actor, and metadata context', async () => {
    executeMock.mockResolvedValueOnce(1)

    await recordSuppressionEvent({
      email: 'person@example.com',
      subscriberId: 'sub-1',
      campaignId: 'camp-1',
      reason: 'complaint',
      action: 'added',
      source: 'webhook',
      actorUserId: 'user-1',
      metadata: { resendEventId: 'evt-1' }
    })

    expect(executeMock).toHaveBeenCalledTimes(1)
    const [sql, params] = executeMock.mock.calls[0]
    expect(String(sql)).toContain('INSERT INTO suppression_events')
    expect(params).toEqual([
      'person@example.com',
      'sub-1',
      'camp-1',
      'complaint',
      'added',
      'webhook',
      'user-1',
      '{"resendEventId":"evt-1"}'
    ])
  })
})
