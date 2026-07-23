import type { H3Event } from 'h3'

export function normaliseWebsiteOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

export function isWebsiteOriginAllowed(
  allowedOrigins: string[] | null | undefined,
  origin: string | null
): origin is string {
  return Boolean(origin && allowedOrigins?.includes(origin))
}

export function setWebsiteCorsHeaders(event: H3Event, origin: string): void {
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  })
}
