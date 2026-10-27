// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import { readFileSync } from 'node:fs'
import Dashboard from '../../../app/components/social/SpendDashboard.client.vue'
import Table from '../../../app/components/social/SpendVarianceTable.vue'
const item = { groupKey: 'meta:client:a', clientName: 'Client A', platform: 'meta', budget: 1000, spend: 250, variance: -750, variancePercent: -75, impressions: 100, clicks: 10, conversions: 0, campaignCount: 1, spendIds: [], lastSyncedAt: new Date().toISOString() }
let response: any
let csvBlob: Blob
beforeEach(() => {
  response = { projection: 'marketing', month: 10, year: 2026, items: [{ ...item }], totals: { budget: 1000, spend: 250, variance: -750 }, lastSyncedAt: null }
  Object.assign(globalThis, { ...Vue, useToast: () => ({ add: vi.fn() }), useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn() }), useSpendAlerts: () => ({ alertsFor: () => [] }), useGoogleAiMax: () => ({ fetchReadiness: vi.fn(async () => ({})) }), $fetch: vi.fn(async () => ({})), useSocialConnections: () => ({ fetchSpendSummary: vi.fn(async () => response), fetchSpendControlDiagnostics: vi.fn(async () => ({})), fetchPacingReview: vi.fn(async () => ({})), fetchBudgetControlSettings: vi.fn(async () => ({})), updateBudgetControlSettings: vi.fn(), syncSpend: vi.fn() }) })
  URL.createObjectURL = vi.fn((blob: Blob) => { csvBlob = blob; return 'blob:test' })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
async function mount(component: any, props = {}) {
  const el = document.createElement('div'); document.body.append(el)
  const app = Vue.createApp(component, props)
  for (const file of ['SpendDashboard.client.vue', 'SpendVarianceTable.vue']) {
    const source = readFileSync(`${process.cwd()}/app/components/social/${file}`, 'utf8')
    for (const tag of new Set([...source.matchAll(/<([A-Z]\w+)/g)].map(m => m[1]))) {
      if (tag === 'Teleport' || tag === 'Transition') continue
      app.component(tag, { props: ['label', 'items'], template: '<div><slot/><span>{{ label }}</span></div>' })
    }
  }
  const vm: any = app.mount(el)
  await new Promise(resolve => setTimeout(resolve, 5)); await Vue.nextTick()
  return { el, state: vm.$.setupState, dispose: () => { app.unmount(); el.remove() } }
}
it('marketing_projection_hides_finance_cards_columns_and_export', async () => {
  const view = await mount(Dashboard)
  expect(view.el.textContent).not.toContain('Commission')
  expect(view.el.textContent).not.toContain('Bank Charged')
  expect(view.el.textContent).not.toContain('Connect Xero')
  view.state.exportCSV(); expect(await csvBlob.text()).not.toContain('Commission')
  expect(await csvBlob.text()).toContain('Client A,meta,1000,250')
  view.dispose()
})
it('marketing_saved_finance_columns_cannot_render_nan_or_zero', async () => {
  const view = await mount(Table, { projection: 'marketing', items: response.items, totals: response.totals })
  view.state.columnVisibility = { ...view.state.columnVisibility, commission: true, owner: true, bankCharged: true }
  await Vue.nextTick()
  expect(view.el.textContent).not.toMatch(/Commission|Owner|NaN/)
  expect(view.el.querySelector('tfoot')?.textContent).toContain('250')
  view.dispose()
})
it('finance_projection_preserves_rendering_export_and_spend_math', async () => {
  response = { ...response, projection: 'finance', items: [{ ...item, commission: 25, commissionRate: 10, clientCode: 'AC', owner: null }], totals: { ...response.totals, commission: 25 }, latestSyncJobs: [] }
  const dashboard = await mount(Dashboard)
  expect(dashboard.el.textContent).toContain('Commission')
  expect(dashboard.el.textContent).toContain('Bank Charged')
  dashboard.state.exportCSV(); expect(await csvBlob.text()).toContain('Commission'); expect(await csvBlob.text()).toContain('250,25,-750,-75%')
  const table = await mount(Table, { projection: 'finance', items: response.items, totals: response.totals })
  table.state.columnVisibility = { ...table.state.columnVisibility, commission: true }; await Vue.nextTick()
  expect(table.el.querySelector('tfoot')?.textContent).toContain('25')
  dashboard.dispose(); table.dispose()
})
