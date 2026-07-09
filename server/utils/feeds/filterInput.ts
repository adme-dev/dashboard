type UnknownRecord = Record<string, unknown>

const SMALL_LIST_LIMIT = 100
const CAMPAIGN_REF_LIMIT = 5000

const SMALL_STRING_ARRAY_FIELDS = [
  'makes',
  'models',
  'condition',
  'bodyTypes',
  'fuelTypes',
  'transmission',
  'colors',
  'stockStatus',
  'sellerIds',
  'sellerNames',
  'dealerIds',
] as const

const CAMPAIGN_REF_FIELDS = ['includeIds', 'excludeIds'] as const

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cleanStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value
      .map(item => String(item).trim())
      .filter(Boolean)
      .map(item => item.slice(0, 160))
  )).slice(0, limit)
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeRange(value: unknown, opts: { min?: number, max?: number } = {}): { min?: number, max?: number } | undefined {
  if (!isRecord(value)) return undefined
  const out: { min?: number, max?: number } = {}
  const min = finiteNumber(value.min)
  const max = finiteNumber(value.max)
  if (min !== undefined) out.min = Math.max(opts.min ?? Number.NEGATIVE_INFINITY, Math.min(opts.max ?? Number.POSITIVE_INFINITY, min))
  if (max !== undefined) out.max = Math.max(opts.min ?? Number.NEGATIVE_INFINITY, Math.min(opts.max ?? Number.POSITIVE_INFINITY, max))
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) {
    const currentMin = out.min
    out.min = out.max
    out.max = currentMin
  }
  return out.min === undefined && out.max === undefined ? undefined : out
}

export function normalizeDealerFeedFilters(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}

  const out: Record<string, unknown> = {}

  for (const field of SMALL_STRING_ARRAY_FIELDS) {
    const list = cleanStringList(value[field], SMALL_LIST_LIMIT)
    if (list.length) out[field] = list
  }

  for (const field of CAMPAIGN_REF_FIELDS) {
    const list = cleanStringList(value[field], CAMPAIGN_REF_LIMIT)
    if (list.length) out[field] = list
  }

  const search = typeof value.search === 'string' ? value.search.trim().slice(0, 160) : ''
  if (search) out.search = search

  const years = normalizeRange(value.years, { min: 1900, max: 2100 })
  if (years) out.years = years

  const price = normalizeRange(value.price, { min: 0, max: 10_000_000 })
  if (price) out.price = price

  const kms = normalizeRange(value.kms, { min: 0, max: 2_000_000 })
  if (kms) out.kms = kms

  if (value.onlyActive === true) out.onlyActive = true

  return out
}
