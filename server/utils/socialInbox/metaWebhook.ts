// server/utils/socialInbox/metaWebhook.ts
// HMAC verification for Meta (Facebook/Instagram) webhook deliveries.
import crypto from 'node:crypto'

/** Verify the X-Hub-Signature-256 header against the raw request body using the app secret. */
export function verifyMetaWebhookSignature(rawBody: string, signature: string | undefined, appSecret: string): boolean {
  if (!signature?.startsWith('sha256=') || !appSecret) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
