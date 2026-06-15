import type { PacingReviewItem } from '~~/server/utils/socialSpendPacingReview'
import type { AutoActionMode, AutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'

export interface AutoActionDecision { item: PacingReviewItem; mode: Exclude<AutoActionMode, 'off'> }

export function decideAutoActions(items: PacingReviewItem[], policy: AutoActionPolicy): AutoActionDecision[] {
  if (!policy.enabled) return []
  const out: AutoActionDecision[] = []
  for (const item of items || []) {
    if (!item || !item.mediaSpendId || !item.severity) continue
    const sev = item.severity as 'critical' | 'warning' | 'info'
    const clientId = (item as any).clientId as string | undefined
    const override = clientId ? policy.clientOverrides?.[clientId]?.perSeverity?.[sev] : undefined
    let mode: AutoActionMode = override ?? policy.perSeverity[sev] ?? 'off'
    // Stale data must never drive an auto-proposal — downgrade to notify.
    if (mode === 'propose' && item.issueType === 'stale_sync') mode = 'notify'
    if (mode === 'off') continue
    out.push({ item, mode })
  }
  return out
}
