import { getRequestURL, setHeader } from 'h3'

/** Defence in depth for every restricted HR API response, including errors. */
export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  if (!pathname.startsWith('/api/agency/hr')) return
  if (pathname !== '/api/agency/hr' && pathname.charAt('/api/agency/hr'.length) !== '/') return

  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  setHeader(event, 'Pragma', 'no-cache')
  setHeader(event, 'Expires', '0')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
})
