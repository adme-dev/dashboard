function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

export async function verifyMondayWebhookJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader)))
    if (header.alg !== 'HS256') return null
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify('HMAC', key, decodeBase64Url(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`))
    return valid ? JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) : null
  } catch { return null }
}
