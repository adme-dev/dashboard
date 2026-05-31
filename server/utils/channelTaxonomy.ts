// server/utils/channelTaxonomy.ts
/**
 * Canonical channel resolution backed by the `channel_taxonomy` table
 * (migration 126). Replaces direct use of the hard-coded switch in
 * channelMap.ts for blended/attribution analytics, while keeping channelMap as
 * the seed + fallback so behaviour never regresses if the table is empty or a
 * value is missing.
 *
 * Pure core (`resolveFromTaxonomy`, `taxonomyKey`) is DB-free and unit-tested;
 * the DB-bound `loadTaxonomy`/`resolveCanonicalChannel` layer caches the table
 * once per worker.
 */
import { queryRows } from './db'
import { adPlatformToChannel, leadSourceToChannel } from './channelMap'

export type SourceSystem = 'ad_platform' | 'lead_source' | 'ga4'

export interface TaxonomyRow {
  source_system: SourceSystem
  native_value: string
  canonical_channel: string
}

/** Map key for a (system, native) pair. */
export function taxonomyKey(system: SourceSystem, nativeValue: string): string {
  return `${system}|${nativeValue}`
}

/**
 * Hard-coded fallback used when the taxonomy table lacks an entry. Mirrors the
 * legacy channelMap.ts behaviour:
 *  - ad_platform / lead_source: paid channel or null (unmapped)
 *  - ga4: the GA4 default channel grouping is already canonical → identity
 */
export function fallbackChannel(system: SourceSystem, nativeValue: string): string | null {
  switch (system) {
    case 'ad_platform': return adPlatformToChannel(nativeValue)
    case 'lead_source': return leadSourceToChannel(nativeValue)
    case 'ga4': return nativeValue || null
  }
}

/**
 * Pure resolver: look the pair up in the supplied taxonomy map, else fall back.
 * Records a miss into `unmapped` (when provided) only when BOTH the table and
 * the fallback fail to produce a channel — those are the values that would
 * otherwise be silently bucketed to 'Other'.
 */
export function resolveFromTaxonomy(
  taxonomy: Map<string, string>,
  system: SourceSystem,
  nativeValue: string,
  unmapped?: Map<string, { system: SourceSystem, nativeValue: string }>
): string | null {
  const fromTable = taxonomy.get(taxonomyKey(system, nativeValue))
  if (fromTable) return fromTable
  const fb = fallbackChannel(system, nativeValue)
  if (fb == null && unmapped) {
    unmapped.set(taxonomyKey(system, nativeValue), { system, nativeValue })
  }
  return fb
}

// ---- DB-bound caching layer -------------------------------------------------

let cache: Map<string, string> | null = null
const unmappedSeen = new Map<string, { system: SourceSystem, nativeValue: string }>()

/** Load (and cache) the taxonomy table into a `${system}|${native}` → canonical map. */
export async function loadTaxonomy(force = false): Promise<Map<string, string>> {
  if (cache && !force) return cache
  const rows = await queryRows<TaxonomyRow>(
    `SELECT source_system, native_value, canonical_channel FROM channel_taxonomy`
  )
  const map = new Map<string, string>()
  for (const r of rows) map.set(taxonomyKey(r.source_system, r.native_value), r.canonical_channel)
  cache = map
  return map
}

/** Resolve a native value to its canonical channel (table → fallback). */
export async function resolveCanonicalChannel(system: SourceSystem, nativeValue: string): Promise<string | null> {
  const map = await loadTaxonomy()
  return resolveFromTaxonomy(map, system, nativeValue, unmappedSeen)
}

/** Values that resolved to neither a table entry nor a fallback this process. */
export function collectUnmapped(): Array<{ system: SourceSystem, nativeValue: string }> {
  return [...unmappedSeen.values()]
}

/** Test seam: drop the cache + unmapped log. */
export function resetTaxonomyCache(): void {
  cache = null
  unmappedSeen.clear()
}
