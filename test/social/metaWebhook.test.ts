import { describe, it, expect } from 'vitest'
import { verifyMetaWebhookSignature } from '~~/server/utils/socialInbox/metaWebhook'
import crypto from 'node:crypto'

describe('verifyMetaWebhookSignature', () => {
  const secret = 'appsecret'
  const body = JSON.stringify({ object: 'page', entry: [] })
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  it('accepts a correct signature', () => expect(verifyMetaWebhookSignature(body, sig, secret)).toBe(true))
  it('rejects a tampered body', () => expect(verifyMetaWebhookSignature(body + 'x', sig, secret)).toBe(false))
  it('rejects a missing signature', () => expect(verifyMetaWebhookSignature(body, undefined, secret)).toBe(false))
  it('rejects a wrong-secret signature', () => expect(verifyMetaWebhookSignature(body, sig, 'other')).toBe(false))
})
