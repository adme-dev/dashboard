import type { H3Event } from 'h3'
import pg from 'pg'
import { neon } from '@neondatabase/serverless'
import { resolveHyperdriveConnectionString } from '~~/server/utils/db'
import { sha256Hex } from '~~/server/utils/exportTokens'
import { resolveClientIp } from '~~/server/utils/tracking/client-ip'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { classifyQrUserAgent } from './ua'
import type { ResolvedQr } from './resolve'

const INSERT_SQL = `INSERT INTO qr_scans (qr_code_id, client_id, country, device_type, os, browser, ip_hash, referrer, ua)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`
const COUNTER_SQL = `UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE id = $1`

export interface ScanDbConfig {
  /** Hyperdrive (TCP) connection string, captured from the event's CF env DURING the request. */
  hyperdriveCs: string | null
  /** Direct Neon HTTP connection string (stateless fetch — safe under waitUntil). */
  httpCs: string | null
}

/**
 * Write the scan with a connection that is NOT tied to the request lifecycle.
 *
 * The shared db.ts helpers cache their pg client on event.context and a Nitro
 * `afterResponse` hook (server/plugins/database-connections.ts) closes it the
 * moment the response is sent — but this write runs post-response via
 * waitUntil, so it must own its connection. (That teardown race is why prod
 * scans silently vanished: the insert only succeeded when it happened to beat
 * the hook.) Exported for tests.
 */
export async function writeScan(db: ScanDbConfig, params: unknown[], qrId: string): Promise<void> {
  if (db.hyperdriveCs) {
    const client = new pg.Client({ connectionString: db.hyperdriveCs })
    try {
      await client.connect()
      await client.query(INSERT_SQL, params)
      await client.query(COUNTER_SQL, [qrId])
      return
    } finally {
      await client.end().catch(() => {})
    }
  }
  if (db.httpCs) {
    const sql = neon(db.httpCs, { fullResults: true })
    await sql.query(INSERT_SQL, params)
    await sql.query(COUNTER_SQL, [qrId])
    return
  }
  throw new Error('qr:recordScan: no database connection string available')
}

/** Insert a qr_scans row and bump counters AFTER the redirect is sent. Never throws. */
export function recordScan(event: H3Event, qr: ResolvedQr): void {
  const ua = getHeader(event, 'user-agent') || null
  const country = getHeader(event, 'cf-ipcountry') || null
  const referrer = getHeader(event, 'referer') || null
  const ip = resolveClientIp(getHeader(event, 'cf-connecting-ip'), getRequestIP(event, { xForwardedFor: true }))
  const day = new Date().toISOString().slice(0, 10)
  const salt = process.env.TRACKING_IP_SALT || ''
  const info = classifyQrUserAgent(ua)

  // Capture EVERYTHING the deferred write needs while the request is alive —
  // useEvent()/event.context and its cached pg client are gone after response.
  const env = (event.context as any).cloudflare?.env || {}
  const db: ScanDbConfig = {
    hyperdriveCs: resolveHyperdriveConnectionString(env, 'cached'),
    httpCs: process.env.DATABASE_URL || null,
  }

  runAfterResponse(event, (async () => {
    const ipHash = ip ? await sha256Hex(`${ip}:${salt}:${day}`) : null
    await writeScan(db, [qr.id, qr.clientId, country, info.deviceType, info.os, info.browser, ipHash, referrer, ua?.slice(0, 512) ?? null], qr.id)
  })(), 'qr:recordScan')
}
