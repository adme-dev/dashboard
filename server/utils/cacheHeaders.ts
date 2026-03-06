import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'

/**
 * Set private Cache-Control headers for authenticated API responses.
 * Uses `private` directive since all data is auth-gated.
 *
 * @param event - H3 event
 * @param maxAge - max-age in seconds
 * @param swr - stale-while-revalidate in seconds (optional)
 */
export function setCacheHeaders(event: H3Event, maxAge: number, swr?: number) {
  const swrPart = swr ? `, stale-while-revalidate=${swr}` : ''
  setResponseHeader(event, 'Cache-Control', `private, max-age=${maxAge}${swrPart}`)
}
