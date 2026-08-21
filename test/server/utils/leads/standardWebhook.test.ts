import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  signStandardWebhook,
  verifyStandardWebhook
} from '../../../../server/utils/leads/standardWebhook'

describe('Standard Webhooks verification', () => {
  const secret = `whsec_${randomBytes(32).toString('base64url')}`
  const rawBody = '{"type":"lead.submitted.v1","value":"exact bytes"}'
  const timestamp = 1_755_734_400

  it('verifies the exact raw body and supports a multi-signature header', () => {
    const signature = signStandardWebhook({ rawBody, webhookId: 'receipt-1', timestamp, secret })
    expect(verifyStandardWebhook({
      rawBody,
      webhookId: 'receipt-1',
      webhookTimestamp: String(timestamp),
      webhookSignature: `v1,ZmFrZQ== ${signature}`,
      secrets: [secret],
      nowSeconds: timestamp
    })).toEqual({ ok: true, webhookId: 'receipt-1', timestamp })
  })

  it('rejects body mutation and timestamps outside the replay window', () => {
    const signature = signStandardWebhook({ rawBody, webhookId: 'receipt-1', timestamp, secret })
    expect(verifyStandardWebhook({
      rawBody: `${rawBody}\n`,
      webhookId: 'receipt-1',
      webhookTimestamp: String(timestamp),
      webhookSignature: signature,
      secrets: [secret],
      nowSeconds: timestamp
    })).toEqual({ ok: false, reason: 'invalid_signature' })
    expect(verifyStandardWebhook({
      rawBody,
      webhookId: 'receipt-1',
      webhookTimestamp: String(timestamp),
      webhookSignature: signature,
      secrets: [secret],
      nowSeconds: timestamp + 301
    })).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts the previous secret during rotation overlap', () => {
    const previous = `whsec_${randomBytes(32).toString('base64url')}`
    const signature = signStandardWebhook({ rawBody, webhookId: 'receipt-2', timestamp, secret: previous })
    expect(verifyStandardWebhook({
      rawBody,
      webhookId: 'receipt-2',
      webhookTimestamp: String(timestamp),
      webhookSignature: signature,
      secrets: [secret, previous],
      nowSeconds: timestamp
    }).ok).toBe(true)
  })
})
