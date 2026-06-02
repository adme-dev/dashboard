export interface BudgetChatRow { severity: string; title: string; tags: string[] | null }

export function buildBudgetChatContext(rows: BudgetChatRow[]): string {
  if (rows.length === 0) return 'Budget pacing: No ad-spend pacing issues are currently flagged across active campaigns.'
  const nCrit = rows.filter(r => r.severity === 'critical').length
  const nWarn = rows.filter(r => r.severity === 'warning').length
  const top = rows.slice(0, 8).map(r => r.title).join('; ')
  return `Budget pacing: ${nCrit} critical, ${nWarn} warning ad-spend issues active. ${top}.`
}
