import { describe, it, expect } from 'vitest'
import { buildBudgetChatContext } from '~~/server/utils/budgetChatContext'

describe('buildBudgetChatContext', () => {
  it('summarises active ad-spend anomalies', () => {
    const ctx = buildBudgetChatContext([
      { severity: 'critical', title: 'Mornington Nissan (google_ads) underspending', tags: ['underspend'] },
      { severity: 'warning', title: 'McRae LDV (google_ads) overspending', tags: ['overspend'] },
    ])
    expect(ctx).toContain('1 critical')
    expect(ctx).toContain('Mornington Nissan')
  })

  it('returns an all-clear string when empty', () => {
    expect(buildBudgetChatContext([])).toContain('No ad-spend pacing issues')
  })
})
