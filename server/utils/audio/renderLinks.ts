// server/utils/audio/renderLinks.ts — PURE-ish. HMAC-signed tokens for public render links
// so a stable URL (no embedded expiry) can sit in social media_urls and survive scheduled
// posts. Mirrors the email-marketing links signer. Web Crypto (works on CF Workers + Node).

export interface RenderTokenPayload { jobId: string; format: string }

function getSecret(): string {
  const s = process.env.RENDER_LINK_SECRET
  if (s) return s
  // Fail closed in production; permit a dev-only fixed secret locally so the feature is testable.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('RENDER_LINK_SECRET is not set — refusing to sign render links in production')
  }
  return 'dev-insecure-render-link-secret'
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return new Uint8Array(sig)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** token = base64url(JSON payload) + '.' + base64url(HMAC(payload)) */
export async function signRenderToken(payload: RenderTokenPayload): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = b64urlEncode(await hmac(body))
  return `${body}.${sig}`
}

export async function verifyRenderToken(token: string): Promise<RenderTokenPayload | null> {
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let expected: Uint8Array
  try { expected = await hmac(body) } catch { return null }
  let given: Uint8Array
  try { given = b64urlDecode(sig) } catch { return null }
  if (!timingSafeEqual(expected, given)) return null
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
    if (p && typeof p.jobId === 'string' && typeof p.format === 'string') return { jobId: p.jobId, format: p.format }
    return null
  } catch { return null }
}

/** Build the public, stable render URL that goes into social media_urls. */
export async function renderPublicUrl(jobId: string, format: string, baseUrl: string): Promise<string> {
  const token = await signRenderToken({ jobId, format })
  return `${baseUrl.replace(/\/$/, '')}/api/public/renders/${token}`
}
