import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  sendPortalAuthTransactionalEmail
} from '../../../server/utils/portalAuthEmailTransport'

const message = {
  to: 'client@example.com',
  from: {
    address: 'notification@adme.net.au',
    name: 'XeroFlow Agency'
  },
  subject: 'Your secure portal sign-in link',
  text: 'Open the secure link.',
  html: '<p>Open the secure link.</p>'
}

function result(outcome: 'accepted' | 'retryable' | 'permanent_failure' | 'unavailable') {
  return {
    outcome,
    provider: 'cloudflare_email' as const,
    providerMessageId: outcome === 'accepted' ? 'cf-message-1' : null,
    errorClass: outcome === 'accepted' ? null : `cloudflare_email_${outcome}`
  }
}

describe('portal authentication email transport', () => {
  it('uses Cloudflare as the primary transport', async () => {
    const cloudflareSend = vi.fn().mockResolvedValue(result('accepted'))
    const resendSend = vi.fn()

    await expect(sendPortalAuthTransactionalEmail({
      event: {} as H3Event,
      message,
      cloudflareSend,
      resendSend
    })).resolves.toBe('cloudflare_email')
    expect(resendSend).not.toHaveBeenCalled()
  })

  it.each(['retryable', 'unavailable'] as const)(
    'falls back to Resend for a %s Cloudflare outcome',
    async (outcome) => {
      const resendSend = vi.fn().mockResolvedValue(undefined)

      await expect(sendPortalAuthTransactionalEmail({
        event: {} as H3Event,
        message,
        cloudflareSend: vi.fn().mockResolvedValue(result(outcome)),
        resendSend
      })).resolves.toBe('resend')
      expect(resendSend).toHaveBeenCalledOnce()
    }
  )

  it('does not bypass a permanent Cloudflare suppression or policy failure', async () => {
    const resendSend = vi.fn()

    await expect(sendPortalAuthTransactionalEmail({
      event: {} as H3Event,
      message,
      cloudflareSend: vi.fn().mockResolvedValue(result('permanent_failure')),
      resendSend
    })).rejects.toThrow('cloudflare_email_permanent_failure')
    expect(resendSend).not.toHaveBeenCalled()
  })
})
