/** Public, embeddable per-site write key. URL-safe base64 of 18 random bytes. */
export function generateWriteKey(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  let b64 = btoa(String.fromCharCode(...bytes))
  b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'xf_' + b64
}
