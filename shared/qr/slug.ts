const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export const SLUG_LENGTH = 7
export const SLUG_RE = /^[1-9A-HJ-NP-Za-km-z]{7}$/

export function generateSlug(): string {
  const bytes = new Uint8Array(SLUG_LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

export function isValidSlug(s: unknown): s is string {
  return typeof s === 'string' && SLUG_RE.test(s)
}
