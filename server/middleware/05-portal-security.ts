const PORTAL_CSP = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `script-src 'self' 'unsafe-inline'`,
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

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  const isPortalApi = hasPrefix(pathname, '/api/portal')
  const isPortalPage = hasPrefix(pathname, '/portal')

  if (!isPortalApi && !isPortalPage) return

  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')
  setHeader(event, 'Expires', '0')

  setHeader(event, 'Content-Security-Policy', PORTAL_CSP)
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
