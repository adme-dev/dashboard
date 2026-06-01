import { describe, it, expect } from 'vitest'
import { verifyMetaSignature } from '~~/server/utils/socialInbox/metaWebhook'
import crypto from 'node:crypto'

describe('verifyMetaSignature', () => {
  const secret = 'appsecret'
  const body = JSON.stringify({ object: 'page', entry: [] })
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  it('accepts a correct signature', () => expect(verifyMetaSignature(body, sig, secret)).toBe(true))
  it('rejects a tampered body', () => expect(verifyMetaSignature(body + 'x', sig, secret)).toBe(false))
  it('rejects a missing signature', () => expect(verifyMetaSignature(body, undefined, secret)).toBe(false))
  it('rejects a wrong-secret signature', () => expect(verifyMetaSignature(body, sig, 'other')).toBe(false))
})
