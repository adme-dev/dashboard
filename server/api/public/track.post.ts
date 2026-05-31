/**
 * PUBLIC first-party tracking beacon — POST /api/public/track  (Slice 1)
 *
 * No auth. Write key + (soft) Origin allowlist are the only gates. NEVER throws:
 * a 500 = dropped client events. On any failure we still return 200 so the
 * browser beacon appears to succeed. Body capped at 64 KB before readBody.
 *
 * Cross-origin: identity cookies are managed client-side by the tag; we do NOT
 * Set-Cookie here. We resolve the tenant by write key, not request host.
 */
import { execute } from '~~/server/utils/db'
import { parseTrackPayload } from '~~/server/utils/tracking/track-schema'
import { resolveSiteByWriteKey, isOriginAllowed } from '~~/server/utils/tracking/site-config'
import { snapshotConsent } from '~~/server/utils/tracking/consent'
import { buildEventRows } from '~~/server/utils/tracking/event-insert'

async function sha256Hex(value: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch { return '' }
}

export default defineEventHandler(async (event) => {
  const reqOrigin = getHeader(event, 'origin') || null
  // Always set permissive-but-concrete CORS so the beacon response is readable.
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': reqOrigin || '*',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  })

  try {
    // 1. Write key (query ?k= or body.write_key). Query is preferred (sendBeacon URL).
    const writeKey = (getQuery(event).k as string) || ''
    // 2. Body size cap (64 KB) before parse.
    const contentLength = parseInt(getHeader(event, 'content-length') || '0', 10)
    if (!contentLength || contentLength > 64 * 1024) {
      setResponseStatus(event, 413); return { ok: false }
    }
    // 3. Resolve tenant by write key.
    const site = await resolveSiteByWriteKey(writeKey)
    if (!site) { setResponseStatus(event, 403); return { ok: false } }

    // 4. Parse + validate body.
    const raw = await readBody(event).catch(() => null)
    const parsed = parseTrackPayload(raw)
    if (!parsed.ok) { setResponseStatus(event, 422); return { ok: false, errors: parsed.errors } }

    // 5. Soft origin check — log mismatch, do not block (Slice 1).
    const originOk = isOriginAllowed(site, reqOrigin)
    if (!originOk) console.warn('[track] origin not in allowlist', { site: site.id, reqOrigin })

    // 6. Consent snapshot + request context.
    const consent = snapshotConsent({
      consentCookieValue: getCookie(event, '_xf_consent'),
      cfIpCountry: getHeader(event, 'cf-ipcountry'),
    })
    const ip = getRequestIP(event, { xForwardedFor: true }) || ''
    const ctx = {
      ua: getHeader(event, 'user-agent') || null,
      ipHash: ip ? await sha256Hex(ip) : null,
      origin: reqOrigin,
      consent,
    }

    // 7. Build + insert rows (dedup on (site_id, event_id)).
    const rows = buildEventRows(site, parsed.payload, ctx)
    for (const r of rows) {
      await execute(
        `INSERT INTO tracking_events (
            site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, msclkid, li_fat_id,
            event_data, consent, ua, ip_hash, origin, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
                 $23,$24,$25,$26,$27,$28)
         ON CONFLICT (site_id, event_id) DO NOTHING`,
        [
          r.site_id, r.client_id, r.event_id, r.anon_id, r.session_id, r.event_name, r.page_url, r.referrer,
          r.utm_source, r.utm_medium, r.utm_campaign, r.utm_term, r.utm_content,
          r.gclid, r.gbraid, r.wbraid, r.fbclid, r.fbc, r.fbp, r.ttclid, r.msclkid, r.li_fat_id,
          JSON.stringify(r.event_data), JSON.stringify(r.consent), r.ua, r.ip_hash, r.origin, r.occurred_at,
        ],
      )
    }

    setResponseStatus(event, 200)
    return { ok: true, received: rows.length }
  } catch (err) {
    // Beacon semantics: never surface a 5xx to the page.
    console.error('[track] handler error (returning 200):', err)
    setResponseStatus(event, 200)
    return { ok: true }
  }
})
