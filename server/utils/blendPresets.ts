// server/utils/blendPresets.ts
/**
 * Named data-blending presets (Supermetrics-inspired). Each preset is a reusable
 * blend definition — a metric set over the canonical-channel dimension with a
 * chosen attribution model — that the blended/attribution endpoints and report
 * builder can deploy in one click instead of bespoke per-view SQL.
 *
 * Kept as typed constants (not a table) — YAGNI until operators need to author
 * custom presets. Presets reuse the canonical taxonomy (Task 2.1) and the
 * attribution models (Task 2.5).
 */
import type { AttributionModel } from './attribution'

/** Metrics a preset can request — must exist on BlendedChannelRow / attribution output. */
export type BlendMetric = 'spend' | 'leads' | 'conversions' | 'revenue' | 'sessions' | 'cpl' | 'cpa' | 'roas'

export interface BlendPreset {
  id: string
  label: string
  description: string
  metrics: BlendMetric[]
  dimension: 'canonical_channel'
  attributionModel: AttributionModel
}

export const BLEND_PRESETS: BlendPreset[] = [
  {
    id: 'paid-channel-mix',
    label: 'Paid channel mix',
    description: 'Spend, leads and cost-per-lead across paid channels.',
    metrics: ['spend', 'leads', 'cpl'],
    dimension: 'canonical_channel',
    attributionModel: 'last'
  },
  {
    id: 'last-click',
    label: 'Last-click attribution',
    description: 'Conversions credited to the last channel touched (GA4-aligned).',
    metrics: ['conversions', 'cpa'],
    dimension: 'canonical_channel',
    attributionModel: 'last'
  },
  {
    id: 'blended-roas',
    label: 'Blended ROAS',
    description: 'Revenue against spend blended across all channels.',
    metrics: ['spend', 'revenue', 'roas'],
    dimension: 'canonical_channel',
    attributionModel: 'last'
  },
  {
    id: 'organic-vs-paid',
    label: 'Organic vs paid',
    description: 'Sessions and leads split across organic and paid channels.',
    metrics: ['sessions', 'leads'],
    dimension: 'canonical_channel',
    attributionModel: 'linear'
  },
  {
    id: 'position-based-leads',
    label: 'Position-based lead credit',
    description: 'Lead credit distributed with the position-based (40/20/40) model.',
    metrics: ['leads', 'cpl'],
    dimension: 'canonical_channel',
    attributionModel: 'position'
  }
]

export function getPreset(id: string): BlendPreset | null {
  return BLEND_PRESETS.find(p => p.id === id) ?? null
}
