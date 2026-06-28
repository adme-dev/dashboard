import type { FeedSummary, FeedDetail, VehicleSummary, FeedPlatform } from './types'

function platformOf(raw: any): FeedPlatform {
  return raw?.feed_type === 'facebook' ? 'facebook' : 'google'
}

export function normalizeFeedSummary(raw: any): FeedSummary {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    platform: platformOf(raw),
    isActive: raw.is_active !== false,
  }
}

export function normalizeFeedDetail(raw: any): FeedDetail {
  return {
    ...normalizeFeedSummary(raw),
    filters: (raw.filters ?? {}) as Record<string, unknown>,
    mappings: (raw.mappings ?? {}) as Record<string, unknown>,
    source: (raw.source ?? null) as Record<string, unknown> | null,
  }
}

function num(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return null
}

export function normalizeVehicle(raw: any): VehicleSummary {
  const image = Array.isArray(raw.images) ? (raw.images[0] ?? null) : (raw.image ?? null)
  return {
    id: String(raw.id ?? ''),
    make: String(raw.make ?? ''),
    model: String(raw.model ?? ''),
    year: num(raw.build_year, raw.year),
    price: num(raw.dap_price, raw.price),
    condition: raw.listing_type ?? raw.condition ?? null,
    stockNumber: raw.stock_number ?? null,
    url: raw.url ?? null,
    image: image ?? null,
  }
}
