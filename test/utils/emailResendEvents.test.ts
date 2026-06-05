import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RESEND_EVENT_MAP, handleResendEvent, ruleForResendType } from '~~/server/utils/email-marketing/resendEvents'

const queryOneMock = vi.fn()
const executeMock = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOneMock(...args),
  execute: (...args: unknown[]) => executeMock(...args)
}))

describe('RESEND_EVENT_MAP', () => {
  it('covers the Resend email event types we ingest', () => {
    expect(Object.keys(RESEND_EVENT_MAP).sort()).toEqual([
      'email.bounced', 'email.clicked', 'email.complained',
      'email.delivered', 'email.delivery_delayed', 'email.opened', 'email.sent'
    ])
  })

  it('does not re-count sent (already counted at send time)', () => {
    expect(RESEND_EVENT_MAP['email.sent'].counterColumn).toBeNull()
  })

  it('maps delivered/opened/clicked to their counter columns, no suppression', () => {
    expect(RESEND_EVENT_MAP['email.delivered']).toEqual({ eventType: 'delivered', counterColumn: 'delivered', suppress: false })
    expect(RESEND_EVENT_MAP['email.opened'].counterColumn).toBe('opened')
    expect(RESEND_EVENT_MAP['email.clicked'].counterColumn).toBe('clicked')
  })

  it('suppresses on hard bounce and complaint', () => {
    expect(RESEND_EVENT_MAP['email.bounced'].suppress).toBe('hard_bounce')
    expect(RESEND_EVENT_MAP['email.complained'].suppress).toBe('complaint')
  })

  it('treats delivery delays as soft-bounce signals without hard suppression', () => {
    expect(RESEND_EVENT_MAP['email.delivery_delayed']).toEqual({
      eventType: 'delivery_delayed',
      counterColumn: null,
      suppress: false,
      softBounce: true
    })
  })

  it('ruleForResendType returns null for unknown types', () => {
    expect(ruleForResendType('email.scheduled')).toBeNull()
    expect(ruleForResendType('nonsense')).toBeNull()
  })
})

describe('handleResendEvent suppression audit', () => {
  beforeEach(() => {
    queryOneMock.mockReset()
    executeMock.mockReset()
    delete process.env.EMAIL_SOFT_BOUNCE_SUPPRESSION_THRESHOLD
  })

  it('records suppression history when a hard bounce suppresses a subscriber', async () => {
    queryOneMock
      .mockResolvedValueOnce({ campaign_id: 'camp-1', subscriber_id: 'sub-1' })
      .mockResolvedValueOnce({ email: 'person@example.com' })
    executeMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)

    const result = await handleResendEvent({
      type: 'email.bounced',
      data: { email_id: 'msg-1' }
    }, 'evt-1')

    expect(result).toEqual({ status: 'recorded' })
    const suppressionEventCall = executeMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO suppression_events')
    )
    expect(suppressionEventCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      'camp-1',
      'hard_bounce',
      'added',
      'webhook',
      null,
      '{"resendEventId":"evt-1","resendMessageId":"msg-1","resendType":"email.bounced"}'
    ])
  })

  it('records delivery delays as soft-bounce history without inserting hard suppression', async () => {
    queryOneMock
      .mockResolvedValueOnce({ campaign_id: 'camp-1', subscriber_id: 'sub-1' })
      .mockResolvedValueOnce({ email: 'person@example.com' })
    executeMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)

    const result = await handleResendEvent({
      type: 'email.delivery_delayed',
      data: { email_id: 'msg-1' }
    }, 'evt-soft-1')

    expect(result).toEqual({ status: 'recorded' })
    expect(executeMock.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO suppression_list')
    )).toBe(false)
    expect(executeMock.mock.calls.some(([sql]) =>
      String(sql).includes('soft_bounce_count = soft_bounce_count + 1')
    )).toBe(true)
    const suppressionEventCall = executeMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO suppression_events')
    )
    expect(suppressionEventCall?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      'camp-1',
      'soft_bounce',
      'recorded',
      'webhook',
      null,
      '{"resendEventId":"evt-soft-1","resendMessageId":"msg-1","resendType":"email.delivery_delayed"}'
    ])
  })

  it('suppresses repeated soft bounces only when a threshold is configured', async () => {
    process.env.EMAIL_SOFT_BOUNCE_SUPPRESSION_THRESHOLD = '3'
    queryOneMock
      .mockResolvedValueOnce({ campaign_id: 'camp-1', subscriber_id: 'sub-1' })
      .mockResolvedValueOnce({ email: 'person@example.com', soft_bounce_count: 2 })
    executeMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)

    const result = await handleResendEvent({
      type: 'email.delivery_delayed',
      data: { email_id: 'msg-1' }
    }, 'evt-soft-3')

    expect(result).toEqual({ status: 'recorded' })
    const suppressionListCall = executeMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO suppression_list')
    )
    expect(suppressionListCall?.[1]).toEqual(['person@example.com', 'soft_bounce', 'camp-1'])
    const suppressionEventCalls = executeMock.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO suppression_events')
    )
    expect(suppressionEventCalls.map(call => (call[1] as unknown[])[4])).toEqual(['recorded', 'added'])
    expect(suppressionEventCalls[1]?.[1]).toEqual([
      'person@example.com',
      'sub-1',
      'camp-1',
      'soft_bounce',
      'added',
      'webhook',
      null,
      '{"resendEventId":"evt-soft-3","resendMessageId":"msg-1","resendType":"email.delivery_delayed","softBounceCount":3,"threshold":3}'
    ])
  })
})
