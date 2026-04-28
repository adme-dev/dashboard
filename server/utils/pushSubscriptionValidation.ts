/**
 * Push subscription endpoint validator.
 *
 * The browser hands us a URL the server later POSTs to. Without validation
 * an authenticated user could register an arbitrary URL (e.g. cloud metadata
 * endpoints, internal services) and turn the notification fan-out into an
 * SSRF probe. This module enforces a host allowlist of known push services.
 */

const ALLOWED_PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',           // Chrome / Android
  'android.googleapis.com',       // Chrome legacy
  'push.services.mozilla.com',    // Firefox
  'web.push.apple.com',           // Safari web push
  'push.apple.com',               // Safari (covers api.push.apple.com etc.)
  'notify.windows.com',           // Legacy Edge / WNS
] as const

export function isValidPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || endpoint.length === 0) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    suffix => host === suffix || host.endsWith('.' + suffix)
  )
}
