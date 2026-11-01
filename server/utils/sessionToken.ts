/* eslint @typescript-eslint/no-explicit-any: off -- Preserve the existing canonical session payload contract. */
// Canonical Pages session-signature verifier. Private services may bind a different
// verifier at build time while retaining the same session/role/revocation owner.
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function verifyJwt(token: string): Promise<Record<string, any> | null> {
  try {
    const [dataB64, sigB64] = token.split('.')
    if (!dataB64 || !sigB64) return null

    const encoder = new TextEncoder()
    const data = new Uint8Array([...atob(dataB64)].map(c => c.charCodeAt(0)))
    const sigBytes = new Uint8Array([...atob(sigB64)].map(c => c.charCodeAt(0)))

    // Verify HMAC signature
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, data)
    if (!isValid) return null

    const payload = JSON.parse(new TextDecoder().decode(data))

    // Check expiry (old tokens without exp are allowed for backward compat)
    if (payload.exp && Date.now() > payload.exp) return null

    return payload
  } catch {
    return null
  }
}
