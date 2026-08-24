/** Public QR redirect. GET /q/:code → 302 destination. Scan logged in-request (timeout-capped). */
import { isValidSlug } from '~~/shared/qr/slug'
import { resolveQrCode } from '~~/server/utils/qr/resolve'
import { recordScan } from '~~/server/utils/qr/scans'
import { qrNotFoundPage } from '~~/server/utils/qr/not-found-page'

function notFound(event: any) {
  setResponseStatus(event, 404)
  setResponseHeaders(event, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' })
  return qrNotFoundPage()
}

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!isValidSlug(code)) return notFound(event)
  let qr
  try { qr = await resolveQrCode(event, code) } catch (err) { console.error('[qr:resolve]', err); qr = null }
  if (!qr || !qr.active) return notFound(event)
  await recordScan(event, qr) // never throws; capped at SCAN_WRITE_TIMEOUT_MS
  setResponseHeaders(event, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' })
  return sendRedirect(event, qr.url, 302)
})
