export async function digestPortalSessionToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function generatePortalMagicLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(48))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function normalizePortalRedirect(value?: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '/portal'

  let candidate = value.trim()
  try {
    candidate = decodeURIComponent(candidate)
  } catch {
    return '/portal'
  }

  if (candidate.includes('\\') || candidate.startsWith('//')) return '/portal'

  try {
    const base = new URL('https://portal.local')
    const destination = new URL(candidate, base)
    if (destination.origin !== base.origin) return '/portal'
    if (!/^\/portal(?:\/|$)/.test(destination.pathname)) return '/portal'
    return `${destination.pathname}${destination.search}`
  } catch {
    return '/portal'
  }
}
