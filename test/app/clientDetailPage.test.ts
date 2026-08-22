// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Suspense, computed, createApp, h, nextTick, ref, watch } from 'vue'
import ClientFinancialSummary from '~~/app/components/clients/ClientFinancialSummary.vue'
import ClientFinancialWarnings from '~~/app/components/clients/ClientFinancialWarnings.vue'
import ClientProjectFinancialTable from '~~/app/components/clients/ClientProjectFinancialTable.vue'
import type { ClientFinancialsResponse } from '~~/app/types'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const metadataResponse = {
  client: {
    id: CLIENT_ID,
    name: 'Acme Motors',
    billingType: 'retainer',
    paymentTerms: 30,
    hourlyRate: 180,
    retainerAmount: 6000,
    mediaCommissionRate: 10,
    xeroContactId: 'xero-contact-1',
    contactEmail: 'accounts@example.com',
    contactPhone: '',
    address: '',
    notes: '',
    isActive: true,
  },
  // These legacy route fields deliberately contain values that must never render.
  projects: [{ id: 'legacy-project', name: 'Legacy local project', budgetAmount: 987654 }],
  recentTimeEntries: [{ id: 'legacy-time', projectName: 'Legacy time row', amount: 999 }],
  invoices: [{ id: 'legacy-invoice', number: 'LOCAL-INVOICE', issueDate: '2026-08-01' }],
  mediaSpend: [{ id: 'legacy-media', commission: 777 }],
  summary: { totalRevenue: 987654, totalMediaCommission: 777 },
}

const financialFixture: ClientFinancialsResponse = {
  period: { from: '2026-08-01', to: '2026-08-22', label: '1 Aug – 22 Aug 2026' },
  basis: {
    currency: 'AUD',
    revenue: 'xero_accrec_ex_gst',
    media: 'agency_paid_passthrough',
    projectBudget: 'lifetime_plan',
  },
  summary: {
    xeroRevenue: 12500,
    mediaSpend: 3400,
    agi: 9100,
    labourCost: 2600,
    projectExpenseCost: 400,
    xeroSupplierCost: 900,
    deliveryCost: 3900,
    deliveryProfit: 5200,
    deliveryMarginPct: 57.14,
    marginReason: null,
    hours: 42.5,
    activeProjects: 1,
  },
  projects: [{
    projectId: '22222222-2222-4222-8222-222222222222',
    projectName: 'Launch campaign',
    status: 'active',
    projectBudget: 50000,
    xeroRevenue: 12500,
    mediaSpend: 3400,
    agi: 9100,
    labourCost: 2600,
    projectExpenseCost: 400,
    xeroSupplierCost: 900,
    deliveryCost: 3900,
    deliveryProfit: 5200,
    deliveryMarginPct: 57.14,
    marginReason: null,
    hours: 42.5,
    coverage: { mappedSourceCount: 3, sourceTypes: ['xero_revenue', 'media_spend', 'xero_cost'] },
  }],
  activity: {
    timeEntries: [{
      id: 'time-1',
      projectId: '22222222-2222-4222-8222-222222222222',
      projectName: 'Launch campaign',
      date: '2026-08-14',
      userName: 'Taylor Smith',
      description: 'Campaign build',
      hours: 3.5,
      hourlyRate: 180,
      labourCost: 630,
    }],
    invoices: [{
      id: 'invoice-1',
      invoiceNumber: 'INV-FACADE-42',
      type: 'ACCREC',
      status: 'AUTHORISED',
      date: '2026-08-10',
      dueDate: '2026-09-09',
      total: 8800,
      amountPaid: 6600,
      amountDue: 2200,
      currency: 'AUD',
    }],
    mediaCampaigns: [{
      id: 'campaign-1',
      projectId: '22222222-2222-4222-8222-222222222222',
      projectName: 'Launch campaign',
      campaignName: 'Search launch',
      platform: 'Google Ads',
      budget: 5000,
      actualSpend: 1250,
      pacingStatus: 'on_track',
      sourceState: 'available',
    }],
    totalTimeEntries: 501,
    truncated: true,
  },
  unallocated: {
    xeroRevenue: 0,
    mediaSpend: 0,
    labourCost: 0,
    projectExpenseCost: 0,
    xeroSupplierCost: 0,
    deliveryCost: 0,
  },
  allocationCoverage: {
    overall: { allocated: 16800, unallocated: 0, allocatedItemCount: 3, totalItemCount: 3, percentage: 100 },
    xeroRevenue: { allocated: 12500, unallocated: 0, allocatedItemCount: 1, totalItemCount: 1, percentage: 100 },
    mediaSpend: { allocated: 3400, unallocated: 0, allocatedItemCount: 1, totalItemCount: 1, percentage: 100 },
    xeroSupplierCost: { allocated: 900, unallocated: 0, allocatedItemCount: 1, totalItemCount: 1, percentage: 100 },
  },
  sources: [],
  tracking: { selected: null, options: [] },
  freshness: [
    { source: 'xero_invoices', status: 'fresh', updatedAt: '2026-08-22T01:00:00.000Z', label: 'Xero invoice cache current' },
    { source: 'xero_revenue', status: 'fresh', updatedAt: '2026-08-22T01:00:00.000Z', label: 'Xero line cache current' },
    { source: 'media_spend', status: 'fresh', updatedAt: '2026-08-22T01:00:00.000Z', label: 'Media daily data current' },
    { source: 'time_entries', status: 'fresh', updatedAt: '2026-08-22T01:00:00.000Z', label: 'Live operational time data' },
    { source: 'project_expenses', status: 'fresh', updatedAt: '2026-08-22T01:00:00.000Z', label: 'Live operational expense data' },
  ],
  warnings: [{
    code: 'activity_truncated',
    source: 'activity',
    message: 'Time-entry activity is limited to the most recent rows.',
  }],
  reconciliation: [
    { source: 'xero_revenue', total: 12500, allocated: 12500, unallocated: 0, differenceCents: 0 },
    { source: 'media_spend', total: 3400, allocated: 3400, unallocated: 0, differenceCents: 0 },
  ],
  permissions: { canViewSources: true, canAllocate: true },
}

const stubs = {
  UDashboardPanel: { template: '<main><slot /></main>' },
  UDashboardNavbar: {
    props: ['title'],
    template: '<header><slot name="leading" /><h1>{{ title }}</h1><slot name="trailing" /><slot name="right" /></header>',
  },
  UButton: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button type="button" :data-button="label" :disabled="disabled || loading" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
  },
  UBadge: { props: ['color', 'variant'], template: '<span data-badge><slot /></span>' },
  UCard: { template: '<article><header><slot name="header" /></header><slot /></article>' },
  UAlert: {
    props: ['title', 'description', 'color'],
    template: '<aside role="alert"><strong>{{ title }}</strong><p>{{ description }}</p><slot /><slot name="actions" /></aside>',
  },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  USkeleton: { template: '<div v-bind="$attrs" data-skeleton />' },
  UTabs: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<nav><button v-for="item in items" :key="item.value" type="button" :data-tab="item.value" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }} {{ item.badge }}</button></nav>',
  },
  UTable: {
    props: ['data', 'columns', 'loading'],
    template: '<div data-table><template v-for="item in data" :key="item.id || item.projectId"><slot v-for="column in columns" :key="column.accessorKey" :name="column.accessorKey + \'-cell\'" :row="{ original: item }" /></template></div>',
  },
  USlideover: {
    props: ['open'],
    emits: ['update:open'],
    template: '<aside v-if="open"><slot name="header" /><slot name="body" /><slot name="footer" /></aside>',
  },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  USelectMenu: { props: ['modelValue', 'items'], template: '<span data-select />' },
  UInput: { props: ['modelValue'], template: '<span data-input />' },
  UTextarea: { props: ['modelValue'], template: '<span data-textarea />' },
  UCheckbox: { props: ['modelValue', 'label'], template: '<span>{{ label }}</span>' },
  NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  XfLoader: { template: '<span>Loading client</span>' },
  XeroContactSearch: { template: '<span data-xero-search />' },
  ClientsClientTeamCard: { template: '<article>Account team</article>' },
  TrackingAnalyticsContainer: { template: '<section data-website>Website analytics content</section>' },
  ClientsClientMeasurementPanel: { template: '<section data-measurement>Measurement content</section>' },
  SocialSpendPeriodPicker: {
    props: ['month', 'year', 'weekFilter', 'showSync'],
    emits: ['update:month', 'update:year', 'update:weekFilter'],
    template: '<button type="button" data-period-picker :data-show-sync="String(showSync)" @click="$emit(\'update:weekFilter\', { start: \'2026-08-03\', end: \'2026-08-09\' })">Reporting period</button>',
  },
  ClientsClientFinancialAllocationSlideover: {
    props: ['open', 'clientId', 'projects', 'sources', 'tracking'],
    emits: ['update:open', 'allocated'],
    template: '<aside v-if="open" data-allocation><button type="button" data-emit-allocated @click="$emit(\'allocated\')">Confirm allocation</button></aside>',
  },
  ClientsClientFinancialSummary: ClientFinancialSummary,
  ClientsClientFinancialWarnings: ClientFinancialWarnings,
  ClientsClientProjectFinancialTable: ClientProjectFinancialTable,
}

type FinancialStatus = 'idle' | 'pending' | 'success' | 'error'

function cloneFinancial(value: ClientFinancialsResponse): ClientFinancialsResponse {
  return structuredClone(value)
}

async function flushUi() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

async function mountPage(input: {
  financial?: ClientFinancialsResponse | null
  status?: FinancialStatus
  error?: Error | null
  canAccessMediaBuying?: boolean
} = {}) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-22T12:00:00+10:00'))

  const metadataFetch = vi.fn(async (url: string) => {
    if (url === `/api/agency/clients/${CLIENT_ID}`) return structuredClone(metadataResponse)
    if (url === `/api/agency/clients/${CLIENT_ID}/kpi-targets`) {
      return { targets: [], availableResultTypes: [] }
    }
    throw new Error(`Unexpected metadata request: ${url}`)
  })
  const financialData = ref(input.financial === undefined ? cloneFinancial(financialFixture) : input.financial)
  const financialStatus = ref<FinancialStatus>(input.status ?? 'success')
  const financialError = ref<Error | null>(input.error ?? null)
  const refreshFinancials = vi.fn(async () => undefined)
  let capturedQuery: { value: { from: string; to: string } } | undefined
  const useFetchMock = vi.fn(async (_url: string, options: { query: typeof capturedQuery }) => {
    capturedQuery = options.query
    return {
      data: financialData,
      status: financialStatus,
      error: financialError,
      refresh: refreshFinancials,
    }
  })

  Object.assign(globalThis as any, {
    $fetch: metadataFetch,
    computed,
    definePageMeta: vi.fn(),
    ref,
    useAuth: () => ({
      isManager: computed(() => true),
      isOwner: computed(() => true),
      canAccessMediaBuying: computed(() => input.canAccessMediaBuying ?? true),
      canWrite: computed(() => true),
    }),
    useFetch: useFetchMock,
    useRoute: () => ({ params: { id: CLIENT_ID } }),
    useToast: () => ({ add: vi.fn() }),
    watch,
  })

  vi.resetModules()
  const ClientDetailPage = (await import('~~/app/pages/agency/clients/[id].vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(Suspense, null, {
      default: () => h(ClientDetailPage),
      fallback: () => h('div', 'Loading route'),
    }),
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  await flushUi()

  return {
    app,
    host,
    metadataFetch,
    useFetchMock,
    refreshFinancials,
    financialData,
    financialStatus,
    financialError,
    get query() { return capturedQuery?.value },
  }
}

async function selectTab(host: HTMLElement, tab: string) {
  const button = host.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)
  expect(button).toBeTruthy()
  button!.click()
  await flushUi()
}

function dispose(test: Awaited<ReturnType<typeof mountPage>>) {
  test.app.unmount()
  test.host.remove()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('agency client detail financial façade', () => {
  it('uses one inclusive reactive financial read and renders only façade financial values', async () => {
    const test = await mountPage()
    try {
      expect(test.useFetchMock).toHaveBeenCalledTimes(1)
      expect(test.useFetchMock.mock.calls[0]?.[0]).toBe(`/api/agency/clients/${CLIENT_ID}/financials`)
      expect(test.query).toEqual({ from: '2026-08-01', to: '2026-08-22' })
      expect(test.host.querySelector('[data-period-picker]')?.getAttribute('data-show-sync')).toBe('false')

      for (const label of [
        'Xero revenue', 'Media spend', 'Agency Gross Income', 'Delivery cost',
        'Delivery profit', 'Delivery margin', 'Hours', 'Allocation coverage', 'Active projects',
      ]) {
        expect(test.host.textContent).toContain(label)
      }
      expect(test.host.textContent).toContain('$12,500')
      expect(test.host.textContent).not.toContain('$987,654')
      expect(test.host.textContent).not.toContain('Project Revenue')
      expect(test.host.textContent).not.toContain('LOCAL-INVOICE')

      await selectTab(test.host, 'projects')
      expect(test.host.textContent).toContain('Launch campaign')
      expect(test.host.textContent).toContain('$50,000')
      expect(test.host.textContent).toContain('57.1%')
      expect(test.host.textContent).not.toContain('NaN')

      await selectTab(test.host, 'time')
      expect(test.host.textContent).toContain('Taylor Smith')
      expect(test.host.textContent).toContain('Campaign build')
      expect(test.host.textContent).toContain('3.5h')
      expect(test.host.textContent).toContain('$630')
      expect(test.host.textContent).toContain('Showing 1 of 501 entries')

      await selectTab(test.host, 'invoices')
      expect(test.host.textContent).toContain('INV-FACADE-42')
      expect(test.host.textContent).toContain('$8,800')
      expect(test.host.textContent).toContain('$2,200')
      expect(test.host.textContent).toContain('AUTHORISED')

      await selectTab(test.host, 'media')
      expect(test.host.textContent).toContain('Search launch')
      expect(test.host.textContent).toContain('$5,000')
      expect(test.host.textContent).toContain('$1,250')
      expect(test.host.textContent).toContain('On track')
      expect(test.host.textContent).toContain('Available')

      test.host.querySelector<HTMLButtonElement>('[data-period-picker]')!.click()
      await flushUi()
      expect(test.query).toEqual({ from: '2026-08-03', to: '2026-08-09' })
    } finally {
      dispose(test)
    }
  })

  it('mounts allocation only with façade permission and refetches only financials after allocation', async () => {
    const allowed = await mountPage()
    try {
      const metadataCallsBefore = allowed.metadataFetch.mock.calls.length
      const selectedRange = allowed.query
      allowed.host.querySelector<HTMLButtonElement>('[data-button="Allocate costs"]')!.click()
      await flushUi()
      expect(allowed.host.querySelector('[data-allocation]')).toBeTruthy()

      allowed.host.querySelector<HTMLButtonElement>('[data-emit-allocated]')!.click()
      await flushUi()
      expect(allowed.refreshFinancials).toHaveBeenCalledTimes(1)
      expect(allowed.metadataFetch).toHaveBeenCalledTimes(metadataCallsBefore)
      expect(allowed.query).toEqual(selectedRange)
    } finally {
      dispose(allowed)
    }

    const deniedResponse = cloneFinancial(financialFixture)
    deniedResponse.permissions = { canViewSources: false, canAllocate: false }
    delete deniedResponse.sources
    delete deniedResponse.tracking
    const denied = await mountPage({ financial: deniedResponse })
    try {
      expect(denied.host.querySelector('[data-button="Allocate costs"]')).toBeNull()
      expect(denied.host.querySelector('[data-allocation]')).toBeNull()
    } finally {
      dispose(denied)
    }
  })

  it('keeps Website and Measurement navigable through a retryable financial failure', async () => {
    const test = await mountPage({ financial: null, status: 'error', error: new Error('transport detail') })
    try {
      expect(test.host.textContent).toContain('Financial reporting could not be refreshed')
      expect(test.host.textContent).not.toContain('transport detail')
      test.host.querySelector<HTMLButtonElement>('[data-button="Retry financials"]')!.click()
      await flushUi()
      expect(test.refreshFinancials).toHaveBeenCalledTimes(1)

      await selectTab(test.host, 'website')
      expect(test.host.textContent).toContain('Website analytics content')
      await selectTab(test.host, 'measurement')
      expect(test.host.textContent).toContain('Measurement content')
    } finally {
      dispose(test)
    }
  })

  it('distinguishes media connection, zero, partial, unavailable, and empty source states', async () => {
    const disconnectedResponse = cloneFinancial(financialFixture)
    disconnectedResponse.summary.mediaSpend = 0
    disconnectedResponse.activity.mediaCampaigns = []
    disconnectedResponse.freshness.find(source => source.source === 'media_spend')!.status = 'not_connected'
    disconnectedResponse.freshness.find(source => source.source === 'media_spend')!.label = 'Media not connected'
    const disconnected = await mountPage({ financial: disconnectedResponse })
    try {
      await selectTab(disconnected.host, 'media')
      expect(disconnected.host.textContent).toContain('No media account connected')
    } finally {
      dispose(disconnected)
    }

    const zeroResponse = cloneFinancial(financialFixture)
    zeroResponse.summary.mediaSpend = 0
    zeroResponse.activity.mediaCampaigns = []
    const zero = await mountPage({ financial: zeroResponse })
    try {
      await selectTab(zero.host, 'media')
      expect(zero.host.textContent).toContain('Connected with confirmed zero spend')
    } finally {
      dispose(zero)
    }

    const partialResponse = cloneFinancial(financialFixture)
    partialResponse.summary.mediaSpend = 0
    partialResponse.activity.mediaCampaigns[0]!.actualSpend = 0
    partialResponse.activity.mediaCampaigns[0]!.sourceState = 'partial'
    partialResponse.freshness.find(source => source.source === 'media_spend')!.status = 'partial'
    partialResponse.freshness.find(source => source.source === 'media_spend')!.label = 'Partial daily media data'
    const partial = await mountPage({ financial: partialResponse })
    try {
      await selectTab(partial.host, 'media')
      expect(partial.host.textContent).toContain('Media spend is partial')
      expect(partial.host.textContent).toContain('Partial period unavailable')
    } finally {
      dispose(partial)
    }

    const unavailableResponse = cloneFinancial(financialFixture)
    unavailableResponse.summary.mediaSpend = 0
    unavailableResponse.activity.mediaCampaigns = []
    unavailableResponse.freshness.find(source => source.source === 'media_spend')!.status = 'unavailable'
    unavailableResponse.freshness.find(source => source.source === 'media_spend')!.label = 'Campaign cache unavailable'
    const unavailable = await mountPage({ financial: unavailableResponse })
    try {
      await selectTab(unavailable.host, 'media')
      expect(unavailable.host.textContent).toContain('Media source unavailable')
      expect(unavailable.host.textContent).not.toContain('Connected with confirmed zero spend')
    } finally {
      dispose(unavailable)
    }

    const emptyResponse = cloneFinancial(financialFixture)
    emptyResponse.summary = {
      ...emptyResponse.summary,
      xeroRevenue: 0,
      mediaSpend: 0,
      agi: 0,
      labourCost: 0,
      projectExpenseCost: 0,
      xeroSupplierCost: 0,
      deliveryCost: 0,
      deliveryProfit: 0,
      deliveryMarginPct: null,
      marginReason: 'no_agi',
      hours: 0,
    }
    emptyResponse.activity = { timeEntries: [], invoices: [], mediaCampaigns: [], totalTimeEntries: 0, truncated: false }
    const empty = await mountPage({ financial: emptyResponse })
    try {
      expect(empty.host.textContent).toContain('No financial activity in this period')
    } finally {
      dispose(empty)
    }
  })

  it('shows a financial loading state without removing route navigation', async () => {
    const test = await mountPage({ financial: null, status: 'pending' })
    try {
      expect(test.host.querySelector('[aria-label="Loading client financials"]')).toBeTruthy()
      expect(test.host.querySelector('[data-tab="website"]')).toBeTruthy()
      expect(test.host.querySelector('[data-tab="measurement"]')).toBeTruthy()
    } finally {
      dispose(test)
    }
  })
})
