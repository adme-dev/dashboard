import type { FeedSummary, FeedDetail, VehicleSummary, FeedPlatform } from '../types'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function platformOf(raw: unknown): FeedPlatform {
  const value = asRecord(raw)
  return value.feed_type === 'facebook' ? 'facebook' : 'google'
}

export function normalizeFeedSummary(raw: unknown): FeedSummary {
  const value = asRecord(raw)
  return {
    id: String(value.id ?? ''),
    name: String(value.name ?? ''),
    platform: platformOf(value),
    isActive: value.is_active !== false
  }
}

export function normalizeFeedDetail(raw: unknown): FeedDetail {
  const value = asRecord(raw)
  return {
    ...normalizeFeedSummary(value),
    filters: asRecord(value.filters),
    mappings: asRecord(value.mappings),
    platformSettings: asRecord(value.platform_settings),
    source: value.source == null ? null : asRecord(value.source)
  }
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    return typeof first === 'string' ? first : null
  }
  return null
}

function num(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return null
}

export function normalizeVehicle(raw: unknown): VehicleSummary {
  const value = asRecord(raw)
  const image = firstString(value.images)
    || firstString(value.photos)
    || firstString(value.photo_urls)
    || firstString(value.main_photo_url)
    || firstString(value.image)
    || firstString(value.image_url)
    || firstString(value['g:image_link'])
    || null
  return {
    id: String(value.id ?? ''),
    make: String(value.make ?? ''),
    model: String(value.model ?? ''),
    year: num(value.build_year, value.year),
    price: num(value.dap_price, value.price),
    condition: value.listing_type ?? value.condition ?? value.category ?? value.stock_type ?? null,
    stockNumber: value.stock_number ?? null,
    url: value.url ?? null,
    image
  }
}
