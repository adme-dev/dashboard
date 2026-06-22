// Pure display helpers for the automation escalation inbox. No I/O — unit-tested.

export type EscalationSeverity = 'info' | 'warning' | 'critical'

// Order the inbox surfaces escalations in: most urgent first.
export const SEVERITY_ORDER: EscalationSeverity[] = ['critical', 'warning', 'info']

export interface SeverityMeta {
  label: string
  /** Nuxt UI color token (for UBadge/UButton `color`). */
  color: 'error' | 'warning' | 'neutral'
  /** Lucide icon name. */
  icon: string
  /** Border-color utility for the card's left accent (applied with `border-l-4`). */
  accentClass: string
}

export function severityMeta(severity: string): SeverityMeta {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', color: 'error', icon: 'i-lucide-octagon-alert', accentClass: 'border-error' }
    case 'warning':
      return { label: 'Warning', color: 'warning', icon: 'i-lucide-triangle-alert', accentClass: 'border-warning' }
    default:
      return { label: 'Info', color: 'neutral', icon: 'i-lucide-info', accentClass: 'border-default' }
  }
}

function formatAud(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

/**
 * Render a proposed automation action as a plain-language line a human can act on.
 * Returns null when there is no actionable proposal.
 */
export function summarizeProposedAction(action: Record<string, any> | null | undefined): string | null {
  if (!action || typeof action !== 'object' || Object.keys(action).length === 0) return null

  if (action.type === 'budget_change' && action.from != null && action.to != null) {
    return `Change daily budget ${formatAud(Number(action.from))} → ${formatAud(Number(action.to))}`
  }
  if (action.type === 'campaign_status' && action.status) {
    return `Set campaign status to ${action.status}`
  }

  // Fallback: compact key/value summary (skip nullish + nested objects).
  const parts: string[] = []
  for (const [k, v] of Object.entries(action)) {
    if (v == null || typeof v === 'object') continue
    parts.push(`${k}: ${v}`)
  }
  return parts.length ? parts.join(', ') : null
}
