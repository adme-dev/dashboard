import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

function tokenMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

/**
 * Resolves the Cloudflare binding before the local development environment and
 * compares bearer credentials without exposing token length or contents.
 */
export function isInternalCronAuthorized(
  event: H3Event,
  authorization: string | undefined
): boolean {
  const runtimeToken = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  } | undefined)?.cloudflare?.env?.INTERNAL_CRON_TOKEN
  const expected = typeof runtimeToken === 'string'
    ? runtimeToken
    : process.env.INTERNAL_CRON_TOKEN
  const provided = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''
  return Boolean(expected && provided && tokenMatches(provided, expected))
}
