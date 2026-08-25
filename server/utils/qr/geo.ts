import type { H3Event } from 'h3'

export interface QrScanGeo { country: string | null, city: string | null, region: string | null, postcode: string | null, lat: number | null, lng: number | null }

const num = (v: unknown, limit: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}

const clean = (v: unknown, max = 80): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s && s !== 'XX' && s !== 'T1' ? s.slice(0, max) : null
}

/**
 * Cloudflare's IP geolocation for the scanning device. Prefers `request.cf`
 * (always present on Pages/Workers) and falls back to the "visitor location"
 * managed-transform headers. Everything is approximate — it's the ISP/carrier's
 * location, so treat postcode/suburb as indicative rather than exact.
 */
export function resolveQrScanGeo(event: H3Event): QrScanGeo {
  const ctx = event.context as Record<string, any>
  const cf = ctx.cloudflare?.request?.cf ?? ctx._platform?.cloudflare?.request?.cf ?? {}
  return {
    country: clean(cf.country, 2) ?? clean(getHeader(event, 'cf-ipcountry'), 2),
    city: clean(cf.city) ?? clean(getHeader(event, 'cf-ipcity')),
    region: clean(cf.region) ?? clean(getHeader(event, 'cf-region')),
    postcode: clean(cf.postalCode, 16) ?? clean(getHeader(event, 'cf-postal-code'), 16),
    lat: num(cf.latitude ?? getHeader(event, 'cf-iplatitude'), 90),
    lng: num(cf.longitude ?? getHeader(event, 'cf-iplongitude'), 180)
  }
}
