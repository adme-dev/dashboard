// Maps a blend preset's metric set to the visible column accessorKeys of the
// Blended Channels table. Pure — no API calls.

export type BlendMetric = 'spend' | 'leads' | 'conversions' | 'revenue' | 'sessions' | 'cpl' | 'cpa' | 'roas'

export const ALL_PRESET_SENTINEL = 'all' as const

// Canonical column order of BlendedPanel's table (channel always first).
const COLUMN_ORDER = ['channel', 'spend', 'leads', 'cpl', 'conversions', 'cpa', 'revenue', 'roas', 'sessions'] as const

export function presetColumnKeys(metrics: BlendMetric[] | typeof ALL_PRESET_SENTINEL): string[] {
  if (metrics === ALL_PRESET_SENTINEL) return [...COLUMN_ORDER]
  const wanted = new Set<string>(metrics)
  return COLUMN_ORDER.filter(key => key === 'channel' || wanted.has(key))
}
