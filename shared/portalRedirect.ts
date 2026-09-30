export function normalizePortalRedirect(value?: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '/portal'

  let candidate = value.trim()
  try {
    candidate = decodeURIComponent(candidate)
  } catch {
    return '/portal'
  }

  if (candidate.includes('\\') || [...candidate].some(character => character.charCodeAt(0) <= 32) || candidate.startsWith('//')) return '/portal'

  try {
    const base = new URL('https://portal.local')
    const destination = new URL(candidate, base)
    if (destination.origin !== base.origin) return '/portal'
    if (/%(?:2f|5c|2e|25)/i.test(destination.pathname)) return '/portal'
    if (!/^\/(?:portal(?:\/|$)|studio\/sites(?:\/|$))/.test(destination.pathname)) return '/portal'
    return `${destination.pathname}${destination.search}`
  } catch {
    return '/portal'
  }
}
