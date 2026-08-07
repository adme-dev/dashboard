// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'

import GoogleCampaignBudgetSummary from '~~/app/components/briefs/GoogleCampaignBudgetSummary.vue'

const ready = {
  status: 'ready' as const,
  launchBlocked: false as const,
  code: null,
  remediation: null,
  calculationTimezone: 'Australia/Melbourne',
  accountValidation: 'pending' as const,
  legacyDailyBudget: null,
  displayCurrency: 'AUD',
  contract: {
    currency: 'AUD',
    period: 'CUSTOM_PERIOD' as const,
    startDate: '2026-07-17',
    endDate: '2026-07-31',
    campaignDays: 15,
    allocatedTotal: 1_000,
    dailyBudget: null,
    calculatedDailyPace: 1_000 / 15,
    provider: {
      totalAmountMicros: '1000000000',
      amountMicros: null
    }
  }
}

const stubs = {
  UCard: { template: '<section><slot name="header" /><slot /></section>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' }
}

function render(reconciliation: Record<string, unknown>) {
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(GoogleCampaignBudgetSummary, { reconciliation })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host }
}

describe('GoogleCampaignBudgetSummary', () => {
  it('shows the approved total, dates, inclusive days, pace and exact provider mapping together', () => {
    const { app, host } = render(ready)

    try {
      expect(host.textContent).toContain('Budget reconciled')
      expect(host.textContent).toContain('AUD 1,000.00')
      expect(host.textContent).toContain('17 Jul 2026')
      expect(host.textContent).toContain('31 Jul 2026')
      expect(host.textContent).toContain('15 inclusive days')
      expect(host.textContent).toContain('AUD 66.67/day')
      expect(host.textContent).toContain('CUSTOM_PERIOD')
      expect(host.textContent).toContain('totalAmountMicros')
      expect(host.textContent).toContain('1000000000')
      expect(host.textContent).toContain('amountMicros remains unset')
    } finally {
      app.unmount()
    }
  })

  it('renders legacy ambiguity as a blocking remediation rather than a converted total', () => {
    const { app, host } = render({
      ...ready,
      status: 'legacy_ambiguous',
      launchBlocked: true,
      code: 'BUDGET_LEGACY_DAILY_AMBIGUOUS',
      remediation: 'Enter the approved total allocation. Do not infer it from the legacy daily budget.',
      legacyDailyBudget: 66.67,
      displayCurrency: null,
      contract: null
    })

    try {
      expect(host.textContent).toContain('Launch blocked')
      expect(host.textContent).toContain('Legacy daily budget')
      expect(host.textContent).toContain('66.67')
      expect(host.textContent).toContain('Currency not recorded')
      expect(host.textContent).toContain('Enter the approved total allocation')
      expect(host.textContent).not.toContain('totalAmountMicros = 66670000')
    } finally {
      app.unmount()
    }
  })

  it('uses the recorded legacy currency instead of assuming AUD', () => {
    const { app, host } = render({
      ...ready,
      status: 'legacy_ambiguous',
      launchBlocked: true,
      code: 'BUDGET_LEGACY_DAILY_AMBIGUOUS',
      remediation: 'Enter the approved total allocation.',
      legacyDailyBudget: 66.67,
      displayCurrency: 'USD',
      contract: null
    })

    try {
      expect(host.textContent).toContain('USD 66.67')
      expect(host.textContent).not.toContain('AUD 66.67')
    } finally {
      app.unmount()
    }
  })
})
