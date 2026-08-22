// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import ClientFinancialSummary from '~~/app/components/clients/ClientFinancialSummary.vue'
import ClientFinancialWarnings from '~~/app/components/clients/ClientFinancialWarnings.vue'
import ClientProjectFinancialTable from '~~/app/components/clients/ClientProjectFinancialTable.vue'
import type {
  ClientFinancialSummary as ClientFinancialSummaryContract,
  ClientProjectFinancialRow,
  FinancialAllocationCoverage,
  FinancialReconciliation,
  FinancialSourceFreshness,
  FinancialSourceWarning,
} from '~~/app/types'

const stubs = {
  UCard: { template: '<section data-card><slot /></section>' },
  UBadge: { props: ['color'], template: '<span data-badge><slot /></span>' },
  UAlert: { props: ['title', 'description', 'color'], template: '<aside role="alert">{{ title }} {{ description }}<slot /></aside>' },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  UTable: {
    props: ['data', 'columns', 'loading'],
    template: `
      <div data-table>
        <template v-for="item in data" :key="item.projectId">
          <slot name="projectName-cell" :row="{ original: item }" />
          <slot name="status-cell" :row="{ original: item }" />
          <slot name="projectBudget-cell" :row="{ original: item }" />
          <slot name="xeroRevenue-cell" :row="{ original: item }" />
          <slot name="mediaSpend-cell" :row="{ original: item }" />
          <slot name="deliveryCost-cell" :row="{ original: item }" />
          <slot name="deliveryProfit-cell" :row="{ original: item }" />
          <slot name="deliveryMarginPct-cell" :row="{ original: item }" />
          <slot name="coverage-cell" :row="{ original: item }" />
        </template>
      </div>
    `,
  },
}

const summary: ClientFinancialSummaryContract = {
  xeroRevenue: 0,
  mediaSpend: 1200,
  agi: -1200,
  labourCost: 300,
  projectExpenseCost: 50,
  xeroSupplierCost: 25,
  deliveryCost: 375,
  deliveryProfit: -1575,
  deliveryMarginPct: null,
  marginReason: 'negative_agi',
  hours: 12.5,
  activeProjects: 2,
}

const coverage: FinancialAllocationCoverage = {
  overall: { allocated: 0, unallocated: 1200, allocatedItemCount: 0, totalItemCount: 2, percentage: 0 },
  xeroRevenue: { allocated: 0, unallocated: 0, allocatedItemCount: 0, totalItemCount: 0, percentage: null },
  mediaSpend: { allocated: 0, unallocated: 1200, allocatedItemCount: 0, totalItemCount: 2, percentage: 0 },
  xeroSupplierCost: { allocated: 0, unallocated: 0, allocatedItemCount: 0, totalItemCount: 0, percentage: null },
}

const freshness: FinancialSourceFreshness[] = [
  { source: 'xero_revenue', status: 'fresh', updatedAt: '2026-08-22T01:00:00.000Z', label: 'Xero line cache current' },
  { source: 'media_spend', status: 'partial', updatedAt: null, label: 'Partial daily media data' },
]

const project: ClientProjectFinancialRow = {
  projectId: 'project-1',
  projectName: 'Launch campaign',
  status: 'active',
  projectBudget: null,
  xeroRevenue: 1000,
  mediaSpend: 250,
  agi: 750,
  labourCost: 200,
  projectExpenseCost: 50,
  xeroSupplierCost: 25,
  deliveryCost: 275,
  deliveryProfit: 475,
  deliveryMarginPct: 63.33,
  marginReason: null,
  hours: 8,
  coverage: { mappedSourceCount: 3, sourceTypes: ['xero_revenue', 'media_spend', 'xero_cost'] },
}

function mount(component: object, props: Record<string, unknown>) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(component, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host }
}

describe('Client financial presentation', () => {
  it('renders the approved nine KPI groups with null margin and truthful source states', () => {
    const { app, host } = mount(ClientFinancialSummary, { summary, allocationCoverage: coverage, freshness })
    try {
      expect([...host.querySelectorAll('dt')].map(item => item.textContent?.trim())).toEqual([
        'Xero revenue',
        'Media spend',
        'Agency Gross Income',
        'Delivery cost',
        'Delivery profit',
        'Delivery margin',
        'Hours',
        'Allocation coverage',
        'Active projects',
      ])
      expect(host.querySelectorAll('dd')).toHaveLength(9)
      expect(host.textContent).toContain('$0')
      expect(host.textContent).toContain('—')
      expect(host.textContent).toContain('Negative AGI')
      expect(host.textContent).toContain('Partial daily media data')
      expect(host.querySelectorAll('dd')[5]?.textContent?.trim()).toBe('—')
      expect(host.textContent).not.toContain('$NaN')
    } finally {
      app.unmount()
    }
  })

  it('uses explicit unavailable and unallocated labels instead of invented monetary values', () => {
    const unavailableFreshness: FinancialSourceFreshness[] = [
      { source: 'xero_revenue', status: 'unavailable', updatedAt: null, label: 'Xero line cache unavailable' },
      { source: 'media_spend', status: 'not_connected', updatedAt: null, label: 'Media not connected' },
    ]
    const unavailableCoverage: FinancialAllocationCoverage = {
      ...coverage,
      overall: { allocated: 0, unallocated: 0, allocatedItemCount: 0, totalItemCount: 0, percentage: null },
    }
    const { app, host } = mount(ClientFinancialSummary, { summary, allocationCoverage: unavailableCoverage, freshness: unavailableFreshness })
    try {
      expect(host.textContent).toContain('Not available')
      expect(host.textContent).toContain('No allocatable sources')
      expect(host.textContent).not.toContain('$NaN')
    } finally {
      app.unmount()
    }
  })

  it('renders the project financial cells from Nuxt UI row.original', () => {
    const { app, host } = mount(ClientProjectFinancialTable, { projects: [project] })
    try {
      expect(host.textContent).toContain('Launch campaign')
      expect(host.textContent).toContain('$1,000')
      expect(host.textContent).toContain('$250')
      expect(host.textContent).toContain('$275')
      expect(host.textContent).toContain('$475')
      expect(host.textContent).toContain('63.3%')
      expect(host.textContent).toContain('3 sources mapped')
    } finally {
      app.unmount()
    }
  })

  it('labels a project source with no allocation instead of rendering a false zero', () => {
    const unallocatedProject: ClientProjectFinancialRow = {
      ...project,
      mediaSpend: 0,
      coverage: { mappedSourceCount: 2, sourceTypes: ['xero_revenue', 'xero_cost'] },
    }
    const { app, host } = mount(ClientProjectFinancialTable, { projects: [unallocatedProject] })
    try {
      expect(host.textContent).toContain('Unallocated')
    } finally {
      app.unmount()
    }
  })

  it('shows source-specific alerts without suppressing successful metrics', () => {
    const warnings: FinancialSourceWarning[] = [
      { code: 'media_partial', source: 'media_spend', message: 'Daily media detail is not complete.' },
      { code: 'xero_lines_unavailable', source: 'xero_revenue', message: 'Xero lines could not be loaded.' },
    ]
    const reconciliation: FinancialReconciliation[] = [
      { source: 'media_spend', total: 1200, allocated: 1200, unallocated: 0, differenceCents: 0 },
    ]
    const warningView = mount(ClientFinancialWarnings, { warnings, reconciliation })
    const summaryView = mount(ClientFinancialSummary, { summary, allocationCoverage: coverage, freshness })
    try {
      expect(warningView.host.textContent).toContain('Media spend: Partial data')
      expect(warningView.host.textContent).toContain('Xero revenue: Line data unavailable')
      expect(warningView.host.textContent).toContain('Daily media detail is not complete.')
      expect(summaryView.host.textContent).toContain('$0')
      expect(summaryView.host.textContent).toContain('$375')
    } finally {
      warningView.app.unmount()
      summaryView.app.unmount()
    }
  })
})
