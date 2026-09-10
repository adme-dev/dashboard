const PORTAL_CSP = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data: https:`,
  `media-src 'self' blob: https:`,
  `connect-src 'self' https: wss:`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`
].join('; ')

function hasPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function editorFormOrigin(value: unknown): string {
  if (typeof value !== 'string' || !value || /[\s;*\\]/.test(value)) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password
      || !/^[a-z0-9.-]+$/i.test(url.hostname)) return ''
    return url.origin
  } catch {
    return ''
  }
}

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  const isPortalApi = hasPrefix(pathname, '/api/portal')
    || hasPrefix(pathname, '/api/client-portal')
  const isPortalPage = hasPrefix(pathname, '/portal')

  if (!isPortalApi && !isPortalPage) return

  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')
  setHeader(event, 'Expires', '0')

  // The editor opens through a signed form POST in a popup, which inherits
  // this document's policy. Allow only its configured origin on website pages.
  const editorOrigin = hasPrefix(pathname, '/portal/page-studio')
    ? editorFormOrigin(useRuntimeConfig(event).public.pageStudioEditorUrl)
    : ''
  const csp = editorOrigin
    ? PORTAL_CSP.replace('form-action \'self\'', `form-action 'self' ${editorOrigin}`)
    : PORTAL_CSP
  setHeader(event, 'Content-Security-Policy', csp)
  setHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  setHeader(event, 'X-Frame-Options', 'DENY')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Referrer-Policy', 'no-referrer')
  setHeader(
    event,
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  )
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
  removeResponseHeader(event, 'X-Powered-By')
})
