const encoder = new TextEncoder()

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256HexBytes(value: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new Uint8Array(value)))
}

export interface SigningCoordinates {
  timestampSeconds: string
  nonce: string
}

export async function createSignedHeaders(
  body: string,
  secret: string,
  coordinates: SigningCoordinates
): Promise<Record<string, string>> {
  if (!secret || secret.length > 4096) throw new Error('Email ingestion signing secret is unavailable')
  const digest = await sha256HexBytes(encoder.encode(body))
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`v1\n${coordinates.timestampSeconds}\n${coordinates.nonce}\n${digest}`)
  )
  return {
    'content-type': 'application/json',
    'x-xeroflow-email-timestamp': coordinates.timestampSeconds,
    'x-xeroflow-email-nonce': coordinates.nonce,
    'x-xeroflow-email-signature': `v1=${hex(signature)}`
  }
}
