import type { H3Event } from 'h3'

async function fixedLengthDigestEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ])
  const leftBytes = new Uint8Array(leftDigest)
  const rightBytes = new Uint8Array(rightDigest)
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index]! ^ rightBytes[index]!
  }
  return mismatch === 0
}

export async function requirePlatformAgentServiceAuth(event: H3Event): Promise<void> {
  const expectedKey = process.env.INTERNAL_API_KEY?.trim()
  const authorization = getHeader(event, 'authorization')
  const suppliedKey = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''

  if (!expectedKey || !suppliedKey || !(await fixedLengthDigestEqual(suppliedKey, expectedKey))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}
