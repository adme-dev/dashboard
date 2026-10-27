import { beforeEach, describe, expect, it, vi } from 'vitest'
import { leadAckRecipientHash } from '~~/server/utils/leads/ack/policy'

const db = vi.hoisted(() => ({ queryOne: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: db.queryOne, execute: db.execute }))

const { handleResendEvent } = await import('~~/server/utils/email-marketing/resendEvents')

const ackRow = { recipient_hash: leadAckRecipientHash('visitor@example.net') }
const event = (type: string, to: unknown = ['visitor@example.net']) => ({ type, data: { email_id: 'msg-1', to } })

describe('Resend events for visitor acknowledgements', () => {
  beforeEach(() => {
    db.queryOne.mockReset()
    db.execute.mockReset().mockResolvedValue(1)
  })

  it.each([
    ['email.bounced', 'hard_bounce'],
    ['email.complained', 'complaint']
  ])('suppresses the recipient on %s', async (type, reason) => {
    db.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(ackRow)
    await expect(handleResendEvent(event(type), 'svix-1')).resolves.toEqual({ status: 'recorded' })
    expect(db.queryOne.mock.calls[1]![0]).toContain('FROM lead_ack_sends WHERE provider_message_id = $1')
    const [sql, params] = db.execute.mock.calls[0]!
    expect(sql).toContain('INSERT INTO suppression_list')
    expect(params).toEqual(['visitor@example.net', reason])
    expect(db.execute.mock.calls[1]![0]).toContain('INSERT INTO suppression_events')
  })

  it('ignores delivery events for acknowledgements', async () => {
    db.queryOne.mockResolvedValueOnce(null)
    await expect(handleResendEvent(event('email.delivered'), 'svix-1')).resolves.toEqual({ status: 'unmatched' })
    expect(db.queryOne).toHaveBeenCalledTimes(1)
    expect(db.execute).not.toHaveBeenCalled()
  })

  it.each([
    ['a different recipient', ['someone-else@example.net']],
    ['several recipients', ['visitor@example.net', 'other@example.net']],
    ['a header-injected recipient', 'visitor@example.net\r\nBcc: x@evil.test']
  ])('never suppresses %s', async (_label, to) => {
    db.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(ackRow)
    await expect(handleResendEvent(event('email.bounced', to), 'svix-1')).resolves.toEqual({ status: 'unmatched' })
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('stays unmatched before migration 483 is applied', async () => {
    db.queryOne.mockResolvedValueOnce(null).mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' }))
    await expect(handleResendEvent(event('email.bounced'), 'svix-1')).resolves.toEqual({ status: 'unmatched' })
  })
})
