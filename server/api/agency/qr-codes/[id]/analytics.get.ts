import { queryRows, queryOne } from '~~/server/utils/db'
import { requireQrCodeAccess } from '~~/server/utils/qr/access'
import { parseRange, fillDays } from '~~/server/utils/qr/analytics'

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const { from, to } = parseRange(getQuery(event) as Record<string, unknown>)
  const p = [row.id, from, to]
  const where = `qr_code_id = $1 AND scanned_at >= $2::date AND scanned_at < ($3::date + 1)`
  const breakdown = (col: string) => queryRows<{ key: string, scans: number }>(
    `SELECT COALESCE(${col}, 'Unknown') AS key, COUNT(*)::int AS scans FROM qr_scans WHERE ${where} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p)
  const [totals, daily, countries, devices, os, browsers] = await Promise.all([
    queryOne<any>(`SELECT COUNT(*)::int AS scans, COUNT(DISTINCT ip_hash)::int AS unique,
       COUNT(*) FILTER (WHERE scanned_at >= NOW() - INTERVAL '7 days')::int AS last7 FROM qr_scans WHERE ${where}`, p),
    queryRows<any>(`SELECT to_char(scanned_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS scans, COUNT(DISTINCT ip_hash)::int AS unique
       FROM qr_scans WHERE ${where} GROUP BY 1 ORDER BY 1`, p),
    breakdown('country'), breakdown('device_type'), breakdown('os'), breakdown('browser'),
  ])
  return {
    totals: { scans: totals?.scans ?? 0, unique: totals?.unique ?? 0, last7: totals?.last7 ?? 0, lastScannedAt: row.last_scanned_at },
    range: { from, to }, daily: fillDays(from, to, daily), countries, devices, os, browsers,
  }
})
