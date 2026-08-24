/** Public QR redirect. GET /q/:code → 302 destination. Scan logged after the response. */
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
  recordScan(event, qr)
  setResponseHeaders(event, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' })
  return sendRedirect(event, qr.url, 302)
})
