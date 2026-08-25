import type { H3Event } from 'h3'
import { execute } from '~~/server/utils/db'
import { sha256Hex } from '~~/server/utils/exportTokens'
import { resolveClientIp } from '~~/server/utils/tracking/client-ip'
import { classifyQrUserAgent } from './ua'
import { resolveQrScanGeo } from './geo'
import type { ResolvedQr } from './resolve'
import { emitQr360Event } from './export360'

const INSERT_SQL = `INSERT INTO qr_scans (qr_code_id, client_id, country, device_type, os, browser, ip_hash, referrer, ua, city, region, postcode, lat, lng, variant)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`
const COUNTER_SQL = `UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE id = $1`

/** Cap on how long a scan write may delay the redirect. */
export const SCAN_WRITE_TIMEOUT_MS = 1500

/**
 * Record a scan IN-REQUEST, before the redirect is sent.
 *
 * History: this originally ran post-response via waitUntil, but the
 * `database-connections` plugin closes the event's pg client on
 * `afterResponse`, and even with a dedicated client the deferred write proved
 * unreliable on the Pages runtime (silent loss, no observable logs). Awaiting
 * the write in-request uses the same battle-tested execute() path as every
 * other endpoint; the timeout caps the scanner-facing cost, and errors are
 * swallowed so analytics problems can never break a redirect.
 */
/** Salted, day-scoped IP hash — the scan's identity for unique counts and A/B arm assignment. */
export async function scanIpHash(event: H3Event): Promise<string | null> {
  const ip = resolveClientIp(getHeader(event, 'cf-connecting-ip'), getRequestIP(event, { xForwardedFor: true }))
  if (!ip) return null
  const day = new Date().toISOString().slice(0, 10)
  const salt = process.env.TRACKING_IP_SALT || ''
  return await sha256Hex(`${ip}:${salt}:${day}`)
}

export async function recordScan(event: H3Event, qr: ResolvedQr, opts: { variant?: 'A' | 'B' | null } = {}): Promise<void> {
  try {
    const ua = getHeader(event, 'user-agent') || null
    const geo = resolveQrScanGeo(event)
    const referrer = getHeader(event, 'referer') || null
    const info = classifyQrUserAgent(ua)
    const ipHash = await scanIpHash(event)

    const write = (async () => {
      await execute(INSERT_SQL, [qr.id, qr.clientId, geo.country, info.deviceType, info.os, info.browser, ipHash, referrer, ua?.slice(0, 512) ?? null, geo.city, geo.region, geo.postcode, geo.lat, geo.lng, opts.variant ?? null])
      await execute(COUNTER_SQL, [qr.id])
      await emitQr360Event(event, { clientId: qr.clientId, eventName: 'qr_scan', code: qr.code ?? '', variant: opts.variant ?? null, ipHash, ua, referrer, utm: { medium: qr.utmMedium, campaign: qr.campaign } })
    })()

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), SCAN_WRITE_TIMEOUT_MS) })
    const result = await Promise.race([write.then(() => 'ok' as const), timeout])
    clearTimeout(timer)
    if (result === 'timeout') {
      console.error('[qr:recordScan] write exceeded timeout; redirect not delayed further')
      write.catch(err => console.error('[qr:recordScan] late failure', err))
    }
  } catch (err) {
    console.error('[qr:recordScan]', err)
  }
}
