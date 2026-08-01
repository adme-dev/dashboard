import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../app/pages/agency/social/[platform].vue', import.meta.url), 'utf8')
const composable = readFileSync(new URL('../../app/composables/useSocialConnections.ts', import.meta.url), 'utf8')

describe('social platform partial spend status integration', () => {
  it('loads latest status for the selected platform and period', () => {
    expect(composable).toContain('\'/api/agency/social/spend/latest-sync\'')
    expect(composable).toContain('async function fetchLatestSpendSync')
    expect(page).toContain('const latestSyncJob = ref<SpendSyncJobStatus | null>(null)')
    expect(page).toMatch(/fetchLatestSpendSync\(\s*platform\.value as SocialPlatform,\s*selectedMonth\.value,\s*selectedYear\.value/)
  })

  it('refreshes status after sync and when the period changes', () => {
    expect(page).toContain('await Promise.all([loadSpendData(true), loadBankCharges({ refresh: true }), loadLatestSyncJob()])')
    expect(page).toMatch(/watch\(\[selectedMonth, selectedYear\][\s\S]*loadLatestSyncJob\(\)/)
  })

  it('renders the durable warning above the chart content', () => {
    expect(page).toContain('<SocialSpendPartialDataAlert')
    expect(page).toContain(':job="latestSyncJob"')
    expect(page.indexOf('<SocialSpendPartialDataAlert')).toBeLessThan(page.indexOf('<!-- Spend charts:'))
  })
})
