import { queryRows, queryOne } from '~~/server/utils/db'
import { requireQrCodeAccess } from '~~/server/utils/qr/access'
import { parseQrRange, fillDays } from '~~/server/utils/qr/analytics'
import { QrAbSchema, twoProportionTest } from '~~/shared/qr/ab'

export default defineEventHandler(async (event) => {
  const { row } = await requireQrCodeAccess(event, getRouterParam(event, 'id'))
  const { from, to } = parseQrRange(getQuery(event) as Record<string, unknown>)
  const p = [row.id, from, to]
  const where = `qr_code_id = $1 AND scanned_at >= $2::date AND scanned_at < ($3::date + 1)`
  const breakdown = (col: string) => queryRows<{ key: string, scans: number }>(
    `SELECT COALESCE(${col}, 'Unknown') AS key, COUNT(*)::int AS scans FROM qr_scans WHERE ${where} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p)
  // Leads attributed to this code: the xf_qr click id, or utm_content=<code> (7-char slug; either survives
  // whichever path the lead took — track.js intent, generic webhook, CSV). Range-scoped by submitted_at.
  const leadWhere = `l.client_id = $1 AND l.deleted_at IS NULL AND l.is_test = FALSE
    AND l.submitted_at >= $3::date AND l.submitted_at < ($4::date + 1)
    AND (l.attribution->>'xf_qr' = $2 OR l.attribution->>'utm_content' = $2)`
  const lp = [row.client_id, row.code, from, to]
  const leadPostcode = `NULLIF(regexp_replace(COALESCE(l.field_data->>'postcode', l.field_data->>'post_code', l.field_data->>'postal_code', l.field_data->>'zip', ''), '\\D', '', 'g'), '')`
  const [totals, daily, countries, devices, os, browsers, cities, postcodes, points, leadTotals, leadPostcodes, leadPoints, visits, trackerSite, armScans, armLeads] = await Promise.all([
    queryOne<any>(`SELECT COUNT(*)::int AS scans, COUNT(DISTINCT ip_hash)::int AS unique,
       COUNT(*) FILTER (WHERE scanned_at >= NOW() - INTERVAL '7 days')::int AS last7 FROM qr_scans WHERE ${where}`, p),
    queryRows<any>(`SELECT to_char(scanned_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS scans, COUNT(DISTINCT ip_hash)::int AS unique
       FROM qr_scans WHERE ${where} GROUP BY 1 ORDER BY 1`, p),
    breakdown('country'), breakdown('device_type'), breakdown('os'), breakdown('browser'),
    // Geo is approximate (Cloudflare IP geolocation) — suburb-level at best. Unknowns excluded so the lists stay useful.
    queryRows<{ key: string, scans: number }>(
      `SELECT city || COALESCE(', ' || region, '') AS key, COUNT(*)::int AS scans FROM qr_scans WHERE ${where} AND city IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p),
    queryRows<{ key: string, scans: number }>(
      `SELECT postcode || COALESCE(' · ' || city, '') AS key, COUNT(*)::int AS scans FROM qr_scans WHERE ${where} AND postcode IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p),
    // Cluster-map points: one row per distinct coordinate (CF city centroids, so cardinality stays small).
    queryRows<{ lat: number, lng: number, scans: number, city: string | null, postcode: string | null }>(
      `SELECT lat, lng, COUNT(*)::int AS scans, MIN(city) AS city, MIN(postcode) AS postcode
       FROM qr_scans WHERE ${where} AND lat IS NOT NULL AND lng IS NOT NULL GROUP BY lat, lng ORDER BY 3 DESC LIMIT 2000`, p),
    queryOne<{ leads: number, with_postcode: number }>(
      `SELECT COUNT(*)::int AS leads, COUNT(${leadPostcode})::int AS with_postcode FROM leads l WHERE ${leadWhere}`, lp),
    queryRows<{ key: string, scans: number }>(
      `SELECT pc || COALESCE(' · ' || g.locality, '') AS key, COUNT(*)::int AS scans
       FROM (SELECT ${leadPostcode} AS pc FROM leads l WHERE ${leadWhere}) x
       LEFT JOIN geo_au_postcodes g ON g.postcode = x.pc
       WHERE pc IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, lp),
    queryRows<{ lat: number, lng: number, scans: number, city: string | null, postcode: string | null }>(
      `SELECT g.lat, g.lng, COUNT(*)::int AS scans, g.locality AS city, g.postcode
       FROM (SELECT ${leadPostcode} AS pc FROM leads l WHERE ${leadWhere}) x
       JOIN geo_au_postcodes g ON g.postcode = x.pc
       GROUP BY g.postcode, g.lat, g.lng, g.locality ORDER BY 3 DESC LIMIT 2000`, lp),
    // Site visits the client's XeroFlow tracker attributed to this code (needs track.js on the destination).
    queryOne<{ sessions: number, visitors: number }>(
      `SELECT COUNT(DISTINCT COALESCE(session_id, anon_id))::int AS sessions, COUNT(DISTINCT anon_id)::int AS visitors
       FROM tracking_events WHERE client_id = $1 AND received_at >= $3::date AND received_at < ($4::date + 1)
         AND (event_data->>'xf_qr' = $2 OR utm_content = $2)`, lp),
    queryOne<{ id: string }>(`SELECT id FROM tracking_sites WHERE client_id = $1 LIMIT 1`, [row.client_id]),
    queryRows<{ variant: 'A' | 'B', scans: number }>(`SELECT variant, COUNT(*)::int AS scans FROM qr_scans WHERE ${where} AND variant IN ('A','B') GROUP BY 1`, p),
    queryRows<{ variant: 'A' | 'B', leads: number }>(`SELECT l.attribution->>'xf_qr_variant' AS variant, COUNT(*)::int AS leads FROM leads l WHERE ${leadWhere} AND l.attribution->>'xf_qr_variant' IN ('A','B') GROUP BY 1`, lp)
  ])
  const abCfg = QrAbSchema.safeParse(row.ab ?? {})
  const ab = abCfg.success && abCfg.data.enabled
    ? (() => {
        const arm = (v: 'A' | 'B') => ({ scans: armScans.find(r => r.variant === v)?.scans ?? 0, leads: armLeads.find(r => r.variant === v)?.leads ?? 0 })
        const A = arm('A'), B = arm('B')
        return { enabled: true, urls: { A: row.destination_url, B: abCfg.data.variant_b_url }, splitPct: abCfg.data.split_pct, arms: { A, B }, test: twoProportionTest(A, B) }
      })()
    : null
  return {
    totals: { scans: totals?.scans ?? 0, unique: totals?.unique ?? 0, last7: totals?.last7 ?? 0, lastScannedAt: row.last_scanned_at },
    range: { from, to }, daily: fillDays(from, to, daily), countries, devices, os, browsers, cities, postcodes, points,
    leads: {
      total: leadTotals?.leads ?? 0,
      withPostcode: leadTotals?.with_postcode ?? 0,
      postcodes: leadPostcodes,
      points: leadPoints
    },
    visits: { sessions: visits?.sessions ?? 0, visitors: visits?.visitors ?? 0 },
    trackerInstalled: !!trackerSite,
    ab
  }
})
