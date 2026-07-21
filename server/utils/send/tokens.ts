import { createHash, timingSafeEqual } from 'node:crypto'

const TOKEN_BYTES = 32
const TOKEN_HASH_RE = /^[a-f0-9]{64}$/

export interface SendTokenPair {
  raw: string
  hash: string
}

export function hashSendToken(token: string): string {
  if (!token) throw new Error('Send token cannot be empty')
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createSendToken(): SendTokenPair {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  const raw = Buffer.from(bytes).toString('base64url')
  return { raw, hash: hashSendToken(raw) }
}

export function isSendTokenHash(value: string): boolean {
  return TOKEN_HASH_RE.test(value)
}

export function sendTokenMatchesHash(token: string, expectedHash: string): boolean {
  if (!token || !isSendTokenHash(expectedHash)) return false
  const actualHash = hashSendToken(token)
  return timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'))
}
