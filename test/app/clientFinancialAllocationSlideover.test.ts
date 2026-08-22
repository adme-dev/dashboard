// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import ClientFinancialAllocationSlideover from '~~/app/components/clients/ClientFinancialAllocationSlideover.vue'
import type {
  ClientFinancialsResponse,
  ClientProjectFinancialRow,
  FinancialAllocationSource,
} from '~/types'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_A_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_B_ID = '33333333-3333-4333-8333-333333333333'

const projects: ClientProjectFinancialRow[] = [
  {
    projectId: PROJECT_A_ID,
    projectName: 'Search launch',
    status: 'active',
    projectBudget: null,
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
    coverage: { mappedSourceCount: 0, sourceTypes: [] },
  },
  {
    projectId: PROJECT_B_ID,
    projectName: 'Brand refresh',
    status: 'active',
    projectBudget: null,
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
    coverage: { mappedSourceCount: 0, sourceTypes: [] },
  },
]

const sources: FinancialAllocationSource[] = [
  {
    sourceType: 'media_spend',
    sourceId: '44444444-4444-4444-8444-444444444444',
    projectId: null,
    projectName: null,
    date: '2026-08-10',
    label: 'Winter service campaign',
    description: 'Google search campaign',
    platformVendor: 'Google Ads',
    amount: 1250.5,
    isStale: false,
  },
  {
    sourceType: 'xero_revenue',
    sourceId: 'ACCREC-42:0',
    projectId: null,
    projectName: null,
    date: '2026-08-11',
    label: 'INV-0042',
    description: 'August management fee',
    platformVendor: 'Xero 200',
    amount: 2400,
    isStale: false,
  },
  {
    sourceType: 'xero_cost',
    sourceId: 'ACCPAY-9:0',
    projectId: null,
    projectName: null,
    date: '2026-08-12',
    label: 'BILL-0009',
    description: 'Creative production vendor',
    platformVendor: 'Xero 300',
    amount: 825.25,
    isStale: true,
  },
]

const tracking: ClientFinancialsResponse['tracking'] = {
  selected: { id: 'client-a', name: 'Acme Motors', isActive: true },
  options: [
    { id: 'client-a', name: 'Acme Motors', isActive: true },
    { id: 'client-b', name: 'Beta Motors', isActive: true },
    { id: 'client-archived', name: 'Archived Motors', isActive: false },
  ],
}

const stubs = {
  USlideover: {
    props: ['open', 'title', 'description'],
    emits: ['update:open'],
    template: '<div data-slideover-root><div v-if="!open" data-slideover-trigger><slot /></div><aside v-else data-slideover><slot name="body" /></aside></div>',
  },
  UFormField: {
    props: ['label', 'help'],
    template: '<label data-form-field><span>{{ label }}</span><slot /><small v-if="help">{{ help }}</small></label>',
  },
  USelectMenu: {
    props: ['modelValue', 'items', 'disabled'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
  },
  UInput: {
    props: ['modelValue', 'disabled', 'type'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :disabled="disabled" :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
  },
  UButton: {
    props: ['disabled', 'loading', 'label'],
    emits: ['click'],
    template: '<button v-bind="$attrs" type="button" :disabled="disabled || loading" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
  },
  UBadge: { props: ['color', 'variant'], template: '<span data-badge><slot /></span>' },
  UAlert: { props: ['title', 'description'], template: '<aside role="alert">{{ title }} {{ description }}</aside>' },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
}

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountSlideover(input: {
  fetchMock?: ReturnType<typeof vi.fn>
  sourceRows?: FinancialAllocationSource[]
  trackingOptions?: ClientFinancialsResponse['tracking']
  open?: boolean
} = {}) {
  const fetchMock = input.fetchMock ?? vi.fn(async () => ({}))
  const toast = { add: vi.fn() }
  const allocated = vi.fn()
  const openUpdates = vi.fn()
  const sourceRows = ref(input.sourceRows ?? sources)
  Object.assign(globalThis, {
    $fetch: fetchMock,
    useToast: () => toast,
  })

  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(ClientFinancialAllocationSlideover, {
      open: input.open ?? true,
      clientId: CLIENT_ID,
      projects,
      sources: sourceRows.value,
      tracking: 'trackingOptions' in input ? input.trackingOptions : tracking,
      onAllocated: allocated,
      'onUpdate:open': openUpdates,
    }),
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return {
    app,
    host,
    fetchMock,
    toast,
    allocated,
    openUpdates,
    setSources: (nextSources: FinancialAllocationSource[]) => { sourceRows.value = nextSources },
  }
}

function selectValue(host: HTMLElement, testId: string, value: string) {
  const select = host.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`)
  expect(select).toBeTruthy()
  select!.value = value
  select!.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('ClientFinancialAllocationSlideover', () => {
  it('renders its allocation panel in the slideover body, never as a closed-state trigger', async () => {
    const closed = mountSlideover({ open: false })
    await flushUi()

    expect(closed.host.querySelector('[data-slideover]')).toBeNull()
    expect(closed.host.querySelector('[data-slideover-trigger]')?.textContent?.trim()).toBe('')
    closed.app.unmount()
    closed.host.remove()

    const open = mountSlideover()
    await flushUi()

    expect(open.host.querySelector('[data-slideover]')?.textContent).toContain('Project allocation')
    expect(open.host.querySelector('[data-slideover-trigger]')).toBeNull()
    open.app.unmount()
    open.host.remove()
  })

  it('groups finance sources with their truthful details and labelled full-width selectors', async () => {
    const test = mountSlideover()
    await flushUi()

    expect(test.host.textContent).toContain('Unallocated Media')
    expect(test.host.textContent).toContain('Xero Revenue')
    expect(test.host.textContent).toContain('Xero Costs')
    expect(test.host.textContent).toContain('Winter service campaign')
    expect(test.host.textContent).toContain('Google search campaign')
    expect(test.host.textContent).toContain('Google Ads')
    expect(test.host.textContent).toContain('Media spend')
    expect(test.host.textContent).toContain('10 Aug 2026')
    expect(test.host.textContent).toContain('1,250.50')
    expect(test.host.textContent).toContain('INV-0042')
    expect(test.host.textContent).toContain('Xero revenue')
    expect(test.host.textContent).toContain('Xero cost')
    expect(test.host.textContent).toContain('Stale source')

    const selectors = [...test.host.querySelectorAll<HTMLSelectElement>('select')]
    expect(selectors).toHaveLength(4)
    expect(selectors.every(selector => selector.classList.contains('w-full'))).toBe(true)
    expect(selectors.every(selector => selector.closest('[data-form-field]'))).toBe(true)

    const mediaSelector = test.host.querySelector<HTMLSelectElement>('[data-testid="project-select-44444444-4444-4444-8444-444444444444"]')!
    expect([...mediaSelector.options].map(option => option.value)).toEqual([
      '__unassigned__', PROJECT_A_ID, PROJECT_B_ID,
    ])
    expect([...mediaSelector.options].some(option => option.value === '')).toBe(false)

    test.app.unmount()
    test.host.remove()
  })

  it('filters the supplied source list locally without adding filters to the allocation body', async () => {
    const test = mountSlideover()
    await flushUi()

    const search = test.host.querySelector<HTMLInputElement>('[data-testid="financial-allocation-search"]')!
    search.value = '$1,250.50'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flushUi()
    expect(test.host.querySelectorAll('[data-testid^="source-row-"]')).toHaveLength(1)

    search.value = '1,250'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flushUi()
    expect(test.host.querySelectorAll('[data-testid^="source-row-"]')).toHaveLength(1)

    search.value = 'google'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flushUi()

    expect(test.host.querySelectorAll('[data-testid^="source-row-"]')).toHaveLength(1)
    expect(test.host.textContent).toContain('Winter service campaign')
    expect(test.host.textContent).not.toContain('INV-0042')

    selectValue(test.host, 'financial-allocation-filter', 'media_spend')
    await flushUi()
    selectValue(test.host, 'project-select-44444444-4444-4444-8444-444444444444', PROJECT_A_ID)
    await flushUi()

    expect(test.fetchMock).toHaveBeenCalledWith(
      `/api/agency/clients/${CLIENT_ID}/financial-allocations`,
      {
        method: 'PATCH',
        body: {
          sourceType: 'media_spend',
          sourceId: '44444444-4444-4444-8444-444444444444',
          projectId: PROJECT_A_ID,
        },
      },
    )

    test.app.unmount()
    test.host.remove()
  })

  it('uses the exact discriminated body to assign and unassign a Xero source', async () => {
    const test = mountSlideover()
    await flushUi()

    selectValue(test.host, 'project-select-ACCREC-42:0', PROJECT_B_ID)
    await flushUi()
    selectValue(test.host, 'project-select-ACCREC-42:0', '__unassigned__')
    await flushUi()

    expect(test.fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/agency/clients/${CLIENT_ID}/financial-allocations`,
      {
        method: 'PATCH',
        body: { sourceType: 'xero_line', sourceId: 'ACCREC-42:0', projectId: PROJECT_B_ID },
      },
    )
    expect(test.fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/agency/clients/${CLIENT_ID}/financial-allocations`,
      {
        method: 'PATCH',
        body: { sourceType: 'xero_line', sourceId: 'ACCREC-42:0', projectId: null },
      },
    )

    test.app.unmount()
    test.host.remove()
  })

  it('requires an explicit active Client tracking confirmation before Xero cost allocation', async () => {
    const test = mountSlideover({ trackingOptions: { ...tracking, selected: null } })
    await flushUi()

    const trackingSelect = test.host.querySelector<HTMLSelectElement>('[data-testid="client-tracking-select"]')!
    const costSelect = test.host.querySelector<HTMLSelectElement>('[data-testid="project-select-ACCPAY-9:0"]')!
    expect(trackingSelect).toBeTruthy()
    expect(trackingSelect.compareDocumentPosition(costSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(costSelect.disabled).toBe(true)
    expect([...trackingSelect.options].map(option => option.value)).toEqual(['__select__', 'client-a', 'client-b'])

    selectValue(test.host, 'client-tracking-select', 'client-b')
    await flushUi()
    test.host.querySelector<HTMLButtonElement>('[data-testid="confirm-client-tracking"]')!.click()
    await flushUi()

    expect(test.fetchMock).toHaveBeenCalledWith(
      `/api/agency/clients/${CLIENT_ID}/financial-allocations`,
      {
        method: 'PATCH',
        body: {
          sourceType: 'client_tracking',
          trackingOptionId: 'client-b',
          trackingOptionName: 'Beta Motors',
        },
      },
    )
    expect(costSelect.disabled).toBe(false)

    test.app.unmount()
    test.host.remove()
  })

  it('emits a refresh signal and success toast only after a server-confirmed allocation', async () => {
    const test = mountSlideover()
    await flushUi()

    selectValue(test.host, 'project-select-44444444-4444-4444-8444-444444444444', PROJECT_A_ID)
    await flushUi()

    expect(test.allocated).toHaveBeenCalledTimes(1)
    expect(test.openUpdates).not.toHaveBeenCalled()
    expect(test.toast.add).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Financial allocation updated',
      color: 'success',
    }))

    test.app.unmount()
    test.host.remove()
  })

  it('keeps the selected surface open, restores the authoritative selection, and reports the server message when allocation fails', async () => {
    const error = Object.assign(new Error('raw transport secret must not be exposed'), {
      data: { statusMessage: 'Financial allocation source changed; refresh and try again' },
    })
    const test = mountSlideover({ fetchMock: vi.fn(async () => { throw error }) })
    await flushUi()

    selectValue(test.host, 'project-select-44444444-4444-4444-8444-444444444444', PROJECT_A_ID)
    await flushUi()

    expect(test.host.querySelector('[data-slideover]')).toBeTruthy()
    expect(test.host.querySelector<HTMLSelectElement>('[data-testid="project-select-44444444-4444-4444-8444-444444444444"]')?.value)
      .toBe('__unassigned__')
    expect(test.allocated).not.toHaveBeenCalled()
    expect(test.toast.add).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Could not update financial allocation',
      description: 'Financial allocation source changed; refresh and try again',
      color: 'error',
    }))
    expect(test.host.textContent).not.toContain('raw transport secret')

    test.app.unmount()
    test.host.remove()
  })

  it('restores the latest authoritative selection when source props reconcile before a failed request settles', async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined
    const test = mountSlideover({
      fetchMock: vi.fn(() => new Promise<void>((_resolve, reject) => { rejectRequest = reject })),
    })
    await flushUi()

    selectValue(test.host, 'project-select-44444444-4444-4444-8444-444444444444', PROJECT_A_ID)
    await nextTick()
    test.setSources(sources.map(source => source.sourceId === '44444444-4444-4444-8444-444444444444'
      ? { ...source, projectId: PROJECT_B_ID, projectName: 'Brand refresh' }
      : source))
    await flushUi()

    const selector = test.host.querySelector<HTMLSelectElement>('[data-testid="project-select-44444444-4444-4444-8444-444444444444"]')!
    expect(selector.value).toBe(PROJECT_A_ID)

    rejectRequest?.(new Error('request failed'))
    await flushUi()

    expect(selector.value).toBe(PROJECT_B_ID)
    expect(test.allocated).not.toHaveBeenCalled()
    expect(test.toast.add).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))

    test.app.unmount()
    test.host.remove()
  })

  it('disables a source control while its allocation is in flight and prevents duplicate requests', async () => {
    let resolveRequest: (() => void) | undefined
    const test = mountSlideover({
      fetchMock: vi.fn(() => new Promise<void>((resolve) => { resolveRequest = resolve })),
    })
    await flushUi()

    selectValue(test.host, 'project-select-44444444-4444-4444-8444-444444444444', PROJECT_A_ID)
    await nextTick()
    const selector = test.host.querySelector<HTMLSelectElement>('[data-testid="project-select-44444444-4444-4444-8444-444444444444"]')!
    expect(selector.disabled).toBe(true)

    selectValue(test.host, 'project-select-44444444-4444-4444-8444-444444444444', PROJECT_B_ID)
    await nextTick()
    expect(test.fetchMock).toHaveBeenCalledTimes(1)

    resolveRequest?.()
    await flushUi()
    test.app.unmount()
    test.host.remove()
  })

  it('preserves another pending source selection while a successful refetch reconciles sources', async () => {
    let resolveMedia: (() => void) | undefined
    let rejectRevenue: ((reason?: unknown) => void) | undefined
    const test = mountSlideover({
      fetchMock: vi.fn((_url: string, options: { body: { sourceId: string } }) => {
        if (options.body.sourceId === '44444444-4444-4444-8444-444444444444') {
          return new Promise<void>((resolve) => { resolveMedia = resolve })
        }
        return new Promise<void>((_resolve, reject) => { rejectRevenue = reject })
      }),
    })
    await flushUi()

    selectValue(test.host, 'project-select-44444444-4444-4444-8444-444444444444', PROJECT_A_ID)
    await nextTick()
    selectValue(test.host, 'project-select-ACCREC-42:0', PROJECT_B_ID)
    await nextTick()

    resolveMedia?.()
    await flushUi()
    test.setSources(sources.map(source => source.sourceId === '44444444-4444-4444-8444-444444444444'
      ? { ...source, projectId: PROJECT_A_ID, projectName: 'Search launch' }
      : source))
    await flushUi()

    const revenueSelector = test.host.querySelector<HTMLSelectElement>('[data-testid="project-select-ACCREC-42:0"]')!
    expect(revenueSelector.value).toBe(PROJECT_B_ID)

    rejectRevenue?.(new Error('transport secret'))
    await flushUi()
    expect(revenueSelector.value).toBe('__unassigned__')
    expect(test.toast.add).toHaveBeenCalledWith(expect.objectContaining({
      description: 'The server could not update this financial allocation',
      color: 'error',
    }))

    test.app.unmount()
    test.host.remove()
  })

  it('gives recovery guidance instead of an impossible Client tracking instruction when no active options exist', async () => {
    const test = mountSlideover({
      trackingOptions: {
        selected: null,
        options: [{ id: 'client-archived', name: 'Archived Motors', isActive: false }],
      },
    })
    await flushUi()

    expect(test.host.textContent).toContain('No active Client tracking options')
    expect(test.host.textContent).toContain('An Xero administrator needs to add or activate a Client tracking option')
    expect(test.host.querySelector('[data-testid="client-tracking-select"]')).toBeNull()
    expect(test.host.querySelector('[data-testid="confirm-client-tracking"]')).toBeNull()
    expect(test.host.querySelector<HTMLSelectElement>('[data-testid="project-select-ACCPAY-9:0"]')?.disabled).toBe(true)

    test.app.unmount()
    test.host.remove()
  })

  it('renders a safe empty state when finance-only source data is unavailable', async () => {
    const test = mountSlideover({ sourceRows: [], trackingOptions: undefined })
    await flushUi()

    expect(test.host.textContent).toContain('No matching financial sources')
    expect(test.host.textContent).toContain('No active Client tracking options')
    expect(test.host.querySelector('[data-testid="client-tracking-select"]')).toBeNull()
    expect(test.host.querySelectorAll('[data-testid^="source-row-"]')).toHaveLength(0)
    expect(test.fetchMock).not.toHaveBeenCalled()

    test.app.unmount()
    test.host.remove()
  })

})
