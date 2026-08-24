import type { H3Event } from 'h3'
import { execute } from '~~/server/utils/db'
import { sha256Hex } from '~~/server/utils/exportTokens'
import { resolveClientIp } from '~~/server/utils/tracking/client-ip'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { classifyQrUserAgent } from './ua'
import type { ResolvedQr } from './resolve'

/** Insert a qr_scans row and bump counters AFTER the redirect is sent. Never throws. */
export function recordScan(event: H3Event, qr: ResolvedQr): void {
  const ua = getHeader(event, 'user-agent') || null
  const country = getHeader(event, 'cf-ipcountry') || null
  const referrer = getHeader(event, 'referer') || null
  const ip = resolveClientIp(getHeader(event, 'cf-connecting-ip'), getRequestIP(event, { xForwardedFor: true }))
  const day = new Date().toISOString().slice(0, 10)
  const salt = process.env.TRACKING_IP_SALT || ''
  const info = classifyQrUserAgent(ua)

  runAfterResponse(event, (async () => {
    const ipHash = ip ? await sha256Hex(`${ip}:${salt}:${day}`) : null
    await execute(
      `INSERT INTO qr_scans (qr_code_id, client_id, country, device_type, os, browser, ip_hash, referrer, ua)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [qr.id, qr.clientId, country, info.deviceType, info.os, info.browser, ipHash, referrer, ua?.slice(0, 512) ?? null]
    )
    await execute(`UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE id = $1`, [qr.id])
  })(), 'qr:recordScan')
}
