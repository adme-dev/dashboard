// Brief priority normalization.
//
// The `briefs.priority` column is constrained (`briefs_priority_check`) to exactly
// these four coarse tiers. Brief *template* `priority` fields, however, may offer
// finer or differently-named tiers — e.g. the support templates use "critical"
// (distinct from "urgent") and the graphic-design template uses "normal". Those
// granular values are preserved verbatim in `brief_field_values`; but the value
// written to the top-level `briefs.priority` column MUST be coerced to a valid
// tier or the INSERT throws a CHECK violation (500 on submit).
//
// This normaliser is the single write-boundary guard used by every brief-create
// path (agency + client portal). For an already-valid value it is a no-op.

export const BRIEF_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type BriefPriority = (typeof BRIEF_PRIORITIES)[number]

// Map looser/finer tiers onto the nearest valid column value.
const PRIORITY_ALIASES: Record<string, BriefPriority> = {
  critical: 'urgent',
  asap: 'urgent',
  normal: 'medium',
  none: 'low',
}

function coerce(value: unknown): BriefPriority | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if ((BRIEF_PRIORITIES as readonly string[]).includes(v)) return v as BriefPriority
  return PRIORITY_ALIASES[v] ?? null
}

/**
 * Coerce a submitted priority to a constraint-valid `briefs.priority` value.
 * Tries the submitted value, then the template default, then falls back to 'medium'.
 */
export function normalizeBriefPriority(
  value: unknown,
  fallback?: string | null,
): BriefPriority {
  return coerce(value) ?? coerce(fallback) ?? 'medium'
}
