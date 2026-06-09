async function hmacHex(raw: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function muapiSignature(raw: string, secret: string): Promise<string> {
  return hmacHex(raw, secret)
}

export async function verifyMuapiSignature(raw: string, provided: string, secret: string): Promise<boolean> {
  if (!provided || !secret) return false
  const expected = await hmacHex(raw, secret)
  if (expected.length !== provided.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  return diff === 0
}
