import type { AutoActionDecision } from '~~/server/utils/spendAutoAction'

export interface AutoActionExecutorDeps {
  recordCampaignAction: (input: any) => Promise<{ id: string }>
  hasOpenAutoAction: (mediaSpendId: string, dailyBudget: number) => Promise<boolean>
  notify: (item: AutoActionDecision['item']) => Promise<void>
}

/**
 * Execute auto-action decisions. v1 performs NO platform write — `propose` only
 * records a PLANNED campaign_action_log row (source 'auto_action', deduped) for a
 * human to approve+apply. Fail-safe: a per-item error is logged and skipped.
 */
export async function executeAutoActions(
  decisions: AutoActionDecision[],
  deps: AutoActionExecutorDeps,
): Promise<{ proposed: number; notified: number; skipped: number }> {
  let proposed = 0, notified = 0, skipped = 0
  for (const { item, mode } of decisions || []) {
    try {
      if (mode === 'propose') {
        const dailyBudget = Number(item.recommendedDailyBudget)
        if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) { skipped++; continue }
        if (await deps.hasOpenAutoAction(item.mediaSpendId, dailyBudget)) { skipped++; continue }
        await deps.recordCampaignAction({
          mediaSpendId: item.mediaSpendId,
          platform: item.platform,
          actionType: 'budget_update',
          actionStatus: 'planned',
          previousValue: { dailyBudget: item.currentDailyBudget },
          newValue: { dailyBudget },
          reason: item.recommendedAction,
          metadata: { source: 'auto_action', autoProposed: true, issueType: item.issueType, severity: item.severity },
        })
        proposed++
        await deps.notify(item)
        notified++
      } else if (mode === 'notify') {
        await deps.notify(item)
        notified++
      }
    } catch (err) {
      console.error('[SpendAutoAction] item failed, skipping:', (err as any)?.message)
      skipped++
    }
  }
  return { proposed, notified, skipped }
}
