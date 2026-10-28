// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Suspense, computed, createApp, h, nextTick, ref, watch } from 'vue'

// Browser client directory/detail for explicit MARKETING_MANAGEMENT staff: the server's access
// metadata decides the view, and the financial façade is never requested.

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const marketingDetail = {
  access: { financial: false, scope: 'marketing_management' },
  client: {
    id: CLIENT_ID,
    name: 'Acme Motors',
    isActive: true,
    contactEmail: 'hello@acme.test',
    contactPhone: '0400 000 000',
    reportingTimezone: 'Australia/Melbourne',
    leadCaptureMode: 'capture_only'
  },
  projects: [{ id: 'project-1', name: 'Launch campaign', status: 'active', startDate: '2026-08-01', endDate: null }],
  mediaSpend: [{ id: 7, platform: 'google_ads', period: '2026-08', budgetAllocated: 5000, actualSpend: 1250 }],
  summary: { totalProjects: 1, activeProjects: 1, completedProjects: 0, totalMediaSpend: 1250, totalMediaBudget: 5000 }
}

const stubs = {
  UDashboardPanel: { template: '<main><slot /></main>' },
  UDashboardNavbar: {
    props: ['title'],
    template: '<header><slot name="leading" /><h1>{{ title }}</h1><slot name="trailing" /><slot name="right" /></header>'
  },
  UButton: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button type="button" :data-button="label" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>'
  },
  UBadge: { template: '<span data-badge><slot /></span>' },
  UCard: { template: '<article><header><slot name="header" /></header><slot /></article>' },
  UAlert: { props: ['title', 'description'], template: '<aside role="alert"><strong>{{ title }}</strong><p>{{ description }}</p></aside>' },
  UIcon: { template: '<i />' },
  UAvatar: { props: ['text'], template: '<span>{{ text }}</span>' },
  UTooltip: { template: '<span><slot /></span>' },
  USkeleton: { template: '<div data-skeleton />' },
  UTabs: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<nav><button v-for="item in items" :key="item.value" type="button" :data-tab="item.value" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }} {{ item.badge }}</button></nav>'
  },
  UTable: {
    props: ['data', 'columns', 'loading'],
    template: '<div data-table :data-columns="columns.map(c => c.header).join(\'|\')"><template v-for="item in data" :key="item.id"><span v-for="column in columns" :key="column.accessorKey"><slot :name="column.accessorKey + \'-cell\'" :row="{ original: item }">{{ item[column.accessorKey] }}</slot></span></template></div>'
  },
  UDropdownMenu: {
    props: ['items'],
    template: '<div data-menu :data-items="items.filter(i => i.label).map(i => i.label).join(\'|\')"><slot /></div>'
  },
  USlideover: { props: ['open'], template: '<aside v-if="open"><slot name="body" /></aside>' },
  UModal: { props: ['open'], template: '<aside v-if="open"><slot name="body" /></aside>' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  USelectMenu: { props: ['modelValue', 'items'], template: '<span data-select />' },
  UInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input data-input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UTextarea: { template: '<span />' },
  UCheckbox: { template: '<span />' },
  NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  XfLoader: { template: '<span>Loading client</span>' },
  XeroContactSearch: { template: '<span />' },
  AgencyClientForm: { template: '<form />' },
  ClientsClientTeamCard: { template: '<article>Account team</article>' },
  TrackingAnalyticsContainer: { template: '<section>Website analytics content</section>' },
  ClientsClientMeasurementPanel: { template: '<section>Measurement content</section>' },
  QrGrid: { template: '<section>QR content</section>' },
  SocialSpendPeriodPicker: { template: '<button type="button" data-period-picker>Reporting period</button>' },
  ClientsClientFinancialSummary: { template: '<section>Financial summary</section>' },
  ClientsClientFinancialWarnings: { template: '<section />' },
  ClientsClientProjectFinancialTable: { template: '<section>Project financial table</section>' },
  ClientsClientFinancialAllocationSlideover: { template: '<aside />' }
}

async function flushUi() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

let managerRole = false

function auth() {
  return {
    isManager: computed(() => managerRole),
    isOwner: computed(() => false),
    isAdmin: computed(() => false),
    canAccessMediaBuying: computed(() => true),
    canWrite: computed(() => true)
  }
}

async function mount(page: string, globals: Record<string, unknown>) {
  Object.assign(globalThis as Record<string, unknown>, {
    computed,
    ref,
    watch,
    definePageMeta: vi.fn(),
    useAuth: auth,
    useRoute: () => ({ params: { id: CLIENT_ID } }),
    useToast: () => ({ add: vi.fn() }),
    useState: (_key: string, init: () => unknown) => ref(init()),
    navigateTo: vi.fn(),
    ...globals
  })
  vi.resetModules()
  const Page = (await import(page)).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Page), fallback: () => h('div', 'Loading route') }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  await flushUi()
  const dispose = () => {
    app.unmount()
    host.remove()
  }
  return { host, dispose }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('client detail for explicit marketing management', () => {
  async function mountDetail(detail: unknown = marketingDetail) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T12:00:00+10:00'))
    const requests: string[] = []
    const fetchMock = vi.fn(async (url: string, options?: { method?: string }) => {
      requests.push(url)
      if (url === `/api/agency/clients/${CLIENT_ID}`) return structuredClone(detail)
      if (url.endsWith('/kpi-targets') && options?.method === 'PUT') return { ok: true }
      if (url.endsWith('/kpi-targets')) {
        return {
          targets: [{ resultType: 'lead', targetCostPerResult: 40, targetCtr: null, maxFrequency: null }],
          availableResultTypes: ['lead'],
          revision: 'kpi-rev-7',
          canManage
        }
      }
      if (url.endsWith('/crm-settings')) return null
      if (url === '/api/agency/boards') return { boards: [] }
      throw new Error(`Unexpected request: ${url}`)
    })
    const refreshFinancials = vi.fn(async () => undefined)
    const useFetchMock = vi.fn(async () => ({
      data: ref(null),
      status: ref('idle'),
      error: ref(null),
      refresh: refreshFinancials
    }))
    const mounted = await mount('~~/app/pages/agency/clients/[id].vue', { $fetch: fetchMock, useFetch: useFetchMock })
    return { ...mounted, requests, fetchMock, useFetchMock, refreshFinancials }
  }

  async function selectTab(host: HTMLElement, tab: string) {
    host.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)!.click()
    await flushUi()
  }

  it('never requests the financial façade and omits accounting surfaces', async () => {
    const test = await mountDetail()
    try {
      const options = test.useFetchMock.mock.calls[0]?.[1] as Record<string, unknown> | undefined
      expect(options).toMatchObject({ immediate: false, watch: false })
      expect(test.refreshFinancials).not.toHaveBeenCalled()
      expect(test.requests.some(url => url.includes('/financials'))).toBe(false)

      const text = test.host.textContent ?? ''
      expect(text).toContain('Acme Motors')
      expect(text).toContain('Marketing reporting')
      expect(text).toContain('hello@acme.test')
      for (const hidden of ['Financial performance', 'Financial summary', 'Billing Type', 'Payment Terms', 'Xero Integration', 'Reporting period']) {
        expect(text).not.toContain(hidden)
      }
      expect(text).not.toContain('$0')
      expect(test.host.querySelector('[data-tab="time"]')).toBeNull()
      expect(test.host.querySelector('[data-tab="invoices"]')).toBeNull()
      expect(test.host.querySelector('[data-button="Edit"]')).toBeNull()
      expect(test.host.querySelector('[data-button="New Project"]')).toBeNull()
    } finally {
      test.dispose()
    }
  })

  it('keeps projects, media spend and marketing dashboards usable from detail metadata', async () => {
    const test = await mountDetail()
    try {
      await selectTab(test.host, 'projects')
      expect(test.host.textContent).toContain('Launch campaign')
      expect(test.host.textContent).not.toContain('Project financial table')

      await selectTab(test.host, 'media')
      expect(test.host.textContent).toContain('google_ads')
      expect(test.host.textContent).toContain('$1,250')
      expect(test.host.textContent).toContain('$5,000')
      expect(test.host.querySelector('[data-columns]')?.getAttribute('data-columns')).not.toMatch(/commission/i)

      await selectTab(test.host, 'website')
      expect(test.host.textContent).toContain('Website analytics content')
      await selectTab(test.host, 'measurement')
      expect(test.host.textContent).toContain('Measurement content')
      expect(test.refreshFinancials).not.toHaveBeenCalled()
    } finally {
      test.dispose()
    }
  })
})

describe('client KPI targets for explicit marketing management', () => {
  async function mountDetail(detail: unknown, manager = false, canManage = false) {
    managerRole = manager
    const fetchMock = vi.fn(async (url: string, options?: { method?: string }) => {
      if (url === `/api/agency/clients/${CLIENT_ID}`) return structuredClone(detail)
      if (url.endsWith('/kpi-targets') && options?.method === 'PUT') return { ok: true }
      if (url.endsWith('/kpi-targets')) {
        return {
          targets: [{ resultType: 'lead', targetCostPerResult: 40, targetCtr: null, maxFrequency: null }],
          availableResultTypes: ['lead'],
          revision: 'kpi-rev-7',
          canManage
        }
      }
      if (url.endsWith('/crm-settings')) return null
      if (url === '/api/agency/boards') return { boards: [] }
      throw new Error(`Unexpected request: ${url}`)
    })
    const useFetchMock = vi.fn(async () => ({ data: ref(null), status: ref('idle'), error: ref(null), refresh: vi.fn() }))
    const mounted = await mount('~~/app/pages/agency/clients/[id].vue', { $fetch: fetchMock, useFetch: useFetchMock })
    return { ...mounted, fetchMock }
  }

  function kpiPuts(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.filter(([url, options]) =>
      String(url).endsWith('/kpi-targets') && (options as { method?: string } | undefined)?.method === 'PUT')
  }

  afterEach(() => {
    managerRole = false
  })

  it('lets the marketing view edit KPI targets and binds the save to the server revision', async () => {
    const test = await mountDetail(marketingDetail)
    try {
      expect(test.host.querySelector('[data-button="Add"]')).toBeTruthy()
      test.host.querySelector<HTMLButtonElement>('[data-button="Save targets"]')!.click()
      await flushUi()
      const puts = kpiPuts(test.fetchMock)
      expect(puts).toHaveLength(1)
      expect((puts[0]![1] as { body: unknown }).body).toEqual({
        targets: [{ resultType: 'lead', targetCostPerResult: 40, targetCtr: null, maxFrequency: null }],
        expectedRevision: 'kpi-rev-7'
      })
    } finally {
      test.dispose()
    }
  })

  it('allows a mixed marketing/finance view when fresh KPI metadata permits edits', async () => {
    const test = await mountDetail({ ...structuredClone(marketingDetail), access: { financial: true } }, false, true)
    try {
      test.host.querySelector<HTMLButtonElement>('[data-button="Save targets"]')!.click()
      await flushUi()
      expect(kpiPuts(test.fetchMock)).toHaveLength(1)
      expect((kpiPuts(test.fetchMock)[0]![1] as { body: unknown }).body).toMatchObject({ expectedRevision: 'kpi-rev-7' })
    } finally { test.dispose() }
  })

  it('normalizes cleared optional values and refuses to silently remove an invalid target', async () => {
    const test = await mountDetail(marketingDetail)
    try {
      const fields = test.host.querySelectorAll<HTMLInputElement>('[data-input]')
      fields[1]!.value = ''
      fields[1]!.dispatchEvent(new Event('input', { bubbles: true }))
      await flushUi()
      test.host.querySelector<HTMLButtonElement>('[data-button="Save targets"]')!.click()
      await flushUi()
      expect((kpiPuts(test.fetchMock)[0]![1] as { body: { targets: unknown[] } }).body.targets[0]).toMatchObject({ targetCtr: null })
      fields[0]!.value = ''
      fields[0]!.dispatchEvent(new Event('input', { bubbles: true }))
      await flushUi()
      test.host.querySelector<HTMLButtonElement>('[data-button="Save targets"]')!.click()
      await flushUi()
      expect(kpiPuts(test.fetchMock)).toHaveLength(1)
    } finally { test.dispose() }
  })

  it('keeps legacy KPI behavior: read-only for non-managers and revision-bound saves for managers', async () => {
    const legacyDetail = { ...structuredClone(marketingDetail), access: { financial: true } }
    const readOnly = await mountDetail(legacyDetail)
    try {
      expect(readOnly.host.querySelector('[data-button="Save targets"]')).toBeNull()
      expect(readOnly.host.querySelector('[data-button="Add"]')).toBeNull()
    } finally {
      readOnly.dispose()
    }

    const manager = await mountDetail(legacyDetail, true)
    try {
      manager.host.querySelector<HTMLButtonElement>('[data-button="Save targets"]')!.click()
      await flushUi()
      const puts = kpiPuts(manager.fetchMock)
      expect(puts).toHaveLength(1)
      expect((puts[0]![1] as { body: unknown }).body).toEqual({
        targets: [{ resultType: 'lead', targetCostPerResult: 40, targetCtr: null, maxFrequency: null }],
        expectedRevision: 'kpi-rev-7'
      })
    } finally {
      manager.dispose()
    }
  })
})

describe('client directory for explicit marketing management', () => {
  async function mountList(headers: Record<string, string>, rows: unknown[]) {
    const useFetchMock = vi.fn(async (_url: string, options: { onResponse?: (ctx: unknown) => void }) => {
      options.onResponse?.({ response: { headers: new Headers(headers) } })
      return { data: ref(rows), pending: ref(false), refresh: vi.fn() }
    })
    const mounted = await mount('~~/app/pages/agency/clients/index.vue', { $fetch: vi.fn(), useFetch: useFetchMock })
    return { ...mounted, useFetchMock }
  }

  it('hides revenue, margin, retainer and billing surfaces when the server marks the marketing view', async () => {
    const test = await mountList({ 'x-client-financial-access': 'marketing' }, [
      { id: CLIENT_ID, name: 'Acme Motors', isActive: true, createdAt: '2026-01-01', projectCount: 2, activeProjects: 1 }
    ])
    try {
      const text = test.host.textContent ?? ''
      expect(text).toContain('Acme Motors')
      expect(text).toContain('Active Clients')
      for (const hidden of ['Total Revenue', 'Avg Margin', 'Monthly MRR', '$0', 'New Client']) {
        expect(text).not.toContain(hidden)
      }
      const columns = test.host.querySelector('[data-columns]')?.getAttribute('data-columns') ?? ''
      expect(columns).not.toMatch(/Billing|Retainer|Revenue|Margin/)
      expect(columns).toContain('Projects')
      expect(test.host.querySelector('[data-menu]')?.getAttribute('data-items')).toBe('View Details')
      expect(test.host.querySelector('[data-select]')).toBeNull()
    } finally {
      test.dispose()
    }
  })

  it('keeps the legacy financial directory without the marketing marker', async () => {
    const test = await mountList({}, [
      { id: CLIENT_ID, name: 'Acme Motors', isActive: true, createdAt: '2026-01-01', billingType: 'retainer', retainerAmount: 6000, totalRevenue: 50000, grossMargin: 40, projectCount: 2, activeProjects: 1 }
    ])
    try {
      const text = test.host.textContent ?? ''
      for (const shown of ['Total Revenue', 'Avg Margin', 'Monthly MRR', 'New Client', '$50,000']) {
        expect(text).toContain(shown)
      }
      expect(test.host.querySelector('[data-columns]')?.getAttribute('data-columns')).toContain('Total Revenue')
      expect(test.host.querySelector('[data-menu]')?.getAttribute('data-items')).toContain('Generate Invoice')
    } finally {
      test.dispose()
    }
  })
})
