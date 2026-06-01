// app/utils/crmLifecycle.ts — display helpers for CRM contact lifecycle stages.
// Mirrors the funnel order in server/utils/crm/lifecycle.ts. Auto-imported.

export const LIFECYCLE_STAGES = ['lead', 'prospect', 'active', 'customer', 'lost', 'dormant'] as const
export type LifecycleStage = typeof LIFECYCLE_STAGES[number]

const META: Record<string, { label: string, color: string }> = {
  lead: { label: 'Lead', color: 'neutral' },
  prospect: { label: 'Prospect', color: 'info' },
  active: { label: 'Active', color: 'primary' },
  customer: { label: 'Customer', color: 'success' },
  lost: { label: 'Lost', color: 'error' },
  dormant: { label: 'Dormant', color: 'warning' },
}

export function lifecycleLabel(stage?: string | null): string {
  if (!stage) return '—'
  return META[stage]?.label ?? stage
}

export function lifecycleColor(stage?: string | null): string {
  return (stage && META[stage]?.color) || 'neutral'
}

// Options for a USelectMenu filter — an "All" sentinel plus every stage.
export const LIFECYCLE_FILTER_OPTIONS = [
  { label: 'All lifecycles', value: 'all' },
  ...LIFECYCLE_STAGES.map(s => ({ label: META[s].label, value: s })),
]
