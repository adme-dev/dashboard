import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const spendWidget = readFileSync('app/components/dashboard/SpendPacingWidget.vue', 'utf8')
const dailySpendRoute = readFileSync('server/api/agency/analytics/daily-spend.get.ts', 'utf8')

describe('production dashboard hotfix contract', () => {
  it('uses the analytics daily-spend date contract', () => {
    expect(spendWidget).toContain('query: { startDate: monthStart, endDate: today }')
    expect(spendWidget).not.toContain('query: { from: monthStart, to: today }')
  })

  it('serializes spend dates as ISO calendar dates in SQL', () => {
    expect(dailySpendRoute).toContain('TO_CHAR(ds.spend_date, \'YYYY-MM-DD\') as date')
  })
})
