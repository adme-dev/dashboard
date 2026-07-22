const CAMPAIGN_TOTAL_BUDGET_TYPES = new Set([
  'campaign_total',
  'custom',
  'custom-period',
  'custom_period',
  'lifetime',
  'total'
])

export function isCampaignTotalBudgetType(value: unknown): boolean {
  return CAMPAIGN_TOTAL_BUDGET_TYPES.has(String(value || '').trim().toLowerCase())
}

export function isDailyBudgetActionSupported(value: unknown): boolean {
  return !isCampaignTotalBudgetType(value)
}
