/* eslint-disable @typescript-eslint/no-explicit-any, @stylistic/max-statements-per-line */
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, onMounted, ref, Suspense, watch } from 'vue'
import Team from '~~/app/pages/agency/team.vue'
import Projects from '~~/app/pages/agency/projects/index.vue'
import Project from '~~/app/pages/agency/projects/[id].vue'
import NewProject from '~~/app/pages/agency/projects/new.vue'
import Profitability from '~~/app/components/dashboard/ProjectProfitabilityWidget.vue'
import Dashboard from '~~/app/pages/agency/index.vue'

const finance = ref(false), clients = ref(false), writable = ref(true)
const fetch = vi.fn(), toast = vi.fn()
let projectData: Record<string, unknown>
const mounted: ReturnType<typeof createApp>[] = []
const Box = defineComponent({ props: ['title'], setup(p, { slots }) { return () => h('section', [p.title, slots.header?.(), slots.left?.(), slots.right?.(), slots.default?.(), slots.body?.(), slots.footer?.(), slots.content?.()]) } })
const Button = defineComponent({ props: ['label', 'disabled', 'type'], emits: ['click'], setup(p, { slots, emit }) { return () => h('button', { disabled: !!p.disabled, type: p.type || 'button', onClick: () => emit('click') }, p.label || slots.default?.()) } })
const Table = defineComponent({ props: ['columns', 'data'], setup(p, { slots }) {
  return () => h('article', [
    h('header', (p.columns as any[] || []).map(c => h('span', c.header))),
    ...(p.data as any[] || []).map(row => h('div', (p.columns as any[] || []).map(c => slots[`${c.accessorKey}-cell`]?.({ row: { original: row } }) || String(row[c.accessorKey] ?? ''))))
  ])
} })
const Tabs = defineComponent({ props: ['items'], setup(p) { return () => h('nav', (p.items as any[] || []).map(i => h('span', i.label))) } })
const Field = defineComponent({ props: ['label'], setup(p, { slots }) { return () => h('label', [p.label, slots.default?.()]) } })
const Modal = defineComponent({ props: ['open'], setup(p, { slots }) { return () => p.open ? h('aside', [slots.header?.(), slots.body?.(), slots.footer?.(), slots.content?.()]) : null } })
async function mount(component: unknown) {
  const host = document.createElement('div'); document.body.appendChild(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(component as never) }) })
  for (const n of ['UCard', 'UDashboardPanel', 'UDashboardNavbar', 'NuxtLink', 'ClientOnly', 'UForm', 'UPopover', 'UDropdownMenu', 'DashboardWidgetShell']) app.component(n, Box)
  for (const n of ['UIcon', 'UBadge', 'UProgress', 'UInput', 'UTextarea', 'USelectMenu', 'UCheckbox', 'UCalendar', 'UAvatar', 'XfLoader', 'USkeleton']) app.component(n, defineComponent({ setup() { return () => h('i') } }))
  app.component('UButton', Button); app.component('UTable', Table); app.component('UTabs', Tabs); app.component('UFormField', Field); app.component('UModal', Modal)
  for (const n of ['DashboardProjectProfitabilityWidget', 'DashboardRevenueSnapshotWidget', 'DashboardCashPositionWidget', 'DashboardReceivablesAgingWidget', 'DashboardOverheadBurnWidget', 'DashboardAdSpendWidget', 'DashboardSpendPacingWidget', 'DashboardCampaignAlertsWidget']) app.component(n, { template: `<p>${n}</p>` })
  app.config.warnHandler = () => {}
  app.mount(host); mounted.push(app)
  for (let i = 0; i < 12; i++) { await Promise.resolve(); await nextTick() }
  return host
}
beforeEach(() => {
  finance.value = false; clients.value = false; writable.value = true; vi.clearAllMocks()
  projectData = { project: { id: 'p', name: 'Operational project', status: 'active', clientName: 'Client', hoursWorked: 12, billableHours: 8, startDate: '2026-11-01', endDate: '2026-12-01' }, timeEntries: [], taskStats: { total: 1, completed: 0, inProgress: 1 } }
  fetch.mockImplementation(async () => projectData)
  for (const [name, value] of Object.entries({ computed, ref, watch, onMounted, definePageMeta: () => {}, navigateTo: vi.fn(),
    useRoute: () => ({ params: { id: 'p' }, query: {} }), useRouter: () => ({ push: vi.fn() }), useToast: () => ({ add: toast }), $fetch: fetch,
    useAuth: () => ({ user: ref({ id: 'staff', name: 'Staff', role: 'owner' }), isManager: ref(false), isAdmin: ref(false), canAccessFinance: finance, canWrite: writable, canAccessInvoices: ref(true), hasPermission: (g: string) => g === 'CLIENTS' && clients.value }),
    useFetch: async (path: string) => ({ data: ref(path === '/api/agency/projects' ? [projectData.project] : path === '/api/agency/team-members' ? { members: [] } : []), pending: ref(false), refresh: vi.fn() }),
    useLazyFetch: (path: string) => { fetch(path); return { data: ref(null), status: ref('success') } },
    useLazyAsyncData: (_key: unknown, handler: () => unknown) => { handler(); return { data: ref(null), status: ref('success') } },
    useDashboardWidgets: () => ({ activeWidgets: ref([]), pinnedItems: ref([]), availableWidgets: ref([]), widgetCategories: ref([]), allWidgets: [], isVisible: () => true, widgetOrder: () => 1, toggleWidget: vi.fn(), pinItem: vi.fn(), unpinItem: vi.fn(), loadPreferences: vi.fn(), savePreferences: vi.fn(), resetToDefaults: vi.fn(), applyPersona: vi.fn(), saving: ref(false), loaded: ref(true), preferences: ref({ widgets: [] }) })
  })) vi.stubGlobal(name, value)
})
afterEach(() => { mounted.splice(0).forEach(a => a.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals() })
describe('project UI respects scoped finance responses', () => {
  it('renders omitted private fields safely while preserving operational detail', async () => {
    const host = await mount(Project)
    expect(host.textContent).toContain('Operational project')
    expect(host.textContent).toContain('12.0h')
    for (const text of ['Cost Breakdown', 'Recent Invoices', 'Margin', 'Spent', 'Expenses']) expect(host.textContent).not.toContain(text)
  })
  it('retains CLIENTS planning budgets and the actual authorized invoice tab', async () => {
    clients.value = true
    Object.assign(projectData.project as object, { budgetAmount: 10000, budgetType: 'fixed', mediaCost: 100 })
    projectData.invoices = []
    const host = await mount(Project)
    expect(host.textContent).toContain('Budget')
    expect(host.textContent).toContain('10,000')
    expect(host.textContent).toContain('Invoices')
    expect(host.textContent).not.toContain('Cost Breakdown')
  })
  it('omits planning keys from a metadata-only edit when CLIENTS is not granted', async () => {
    const host = await mount(Project)
    ;([...host.querySelectorAll('button')].find(b => b.textContent === 'Edit Project') as HTMLButtonElement).click()
    await nextTick()
    ;([...host.querySelectorAll('button')].find(b => b.textContent === 'Save Changes') as HTMLButtonElement).click()
    for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick() }
    const options = fetch.mock.calls.find(([,o]) => o?.method === 'PUT')![1]
    expect(options.body).not.toHaveProperty('budgetAmount')
    expect(options.body).not.toHaveProperty('budgetType')
  })
  it('does not offer project creation or private columns without explicit CLIENTS or FINANCE', async () => {
    const host = await mount(Projects)
    expect(host.textContent).not.toContain('New Project')
    expect(host.textContent).not.toContain('Avg Margin')
    expect(host.querySelector('article header')?.textContent).not.toContain('Spent')
    expect(host.querySelector('article header')?.textContent).not.toContain('Budget')
  })
  it('keeps project creation and planning columns for CLIENTS', async () => {
    clients.value = true
    const host = await mount(Projects)
    expect(host.textContent).toContain('New Project')
    expect(host.querySelector('article header')?.textContent).toContain('Budget')
    expect(host.querySelector('article header')?.textContent).not.toContain('Margin')
  })
  it('does not render a priced create form without a planning write grant', async () => {
    const host = await mount(NewProject)
    expect(host.querySelector('form')).toBeNull()
  })
  it('does not request company KPIs or mount finance widgets for a marketing work dashboard', async () => {
    const host = await mount(Dashboard)
    expect(fetch.mock.calls.some(([p]) => p === '/api/agency/kpis')).toBe(false)
    expect(host.textContent).not.toContain('DashboardProjectProfitabilityWidget')
    expect(host.textContent).toContain('DashboardAdSpendWidget')
    expect(host.textContent).toContain('DashboardCampaignAlertsWidget')
  })
})

it('retains full private project cards and company KPI loading for an explicit FINANCE user', async () => {
  finance.value = true
  Object.assign(projectData.project as object, { budgetAmount: 10000, budgetType: 'fixed', mediaCost: 100, totalCost: 2000, remainingBudget: 8000, grossMargin: 80, laborCost: 1800, expenseCost: 100 })
  projectData.invoices = []
  const project = await mount(Project)
  expect(project.textContent).toContain('Cost Breakdown')
  expect(project.textContent).toContain('80.0%')
  const dashboard = await mount(Dashboard)
  expect(fetch.mock.calls.some(([p]) => p === '/api/agency/kpis')).toBe(true)
  expect(dashboard.textContent).toContain('DashboardProjectProfitabilityWidget')
})
it('retains planning values in a CLIENTS edit request', async () => {
  clients.value = true
  Object.assign(projectData.project as object, { budgetAmount: 10000, budgetType: 'fixed' })
  const host = await mount(Project)
  ;([...host.querySelectorAll('button')].find(b => b.textContent === 'Edit Project') as HTMLButtonElement).click()
  await nextTick()
  ;([...host.querySelectorAll('button')].find(b => b.textContent === 'Save Changes') as HTMLButtonElement).click()
  for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick() }
  expect(fetch.mock.calls.find(([,o]) => o?.method === 'PUT')![1].body).toMatchObject({ budgetAmount: 10000 })
})
it('does not offer priced project creation to a read-only CLIENTS user', async () => {
  clients.value = true; writable.value = false
  const host = await mount(NewProject)
  expect(host.querySelector('form')).toBeNull()
})
it('guards the profitability widget request even when it is mounted directly without FINANCE', async () => {
  const host = await mount(Profitability)
  expect(host.textContent).toBe('')
  expect(fetch.mock.calls.some(([p]) => p === '/api/agency/projects/profitability')).toBe(false)
  finance.value = true
  for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick() }
  expect(fetch.mock.calls.some(([p]) => p === '/api/agency/projects/profitability')).toBe(true)
})

it('keeps roster detail usable without inventing zero-valued hidden staff rates', async () => {
  vi.stubGlobal('useAuth', () => ({ canAccessFinance: finance, canWrite: writable, hasPermission: (g: string) => g === 'ADMIN' }))
  vi.stubGlobal('useRoute', () => ({ params: {}, query: { member: 'member' } }))
  fetch.mockResolvedValue({ members: [{ id: 'member', name: 'Staff Member', email: 'staff@example.com', role: 'member', isActive: true, hoursThisMonth: 20, billableHoursThisMonth: 18, targetUtilization: 120, utilizationRate: 15, activeProjects: 3 }] })
  const host = await mount(Team)
  expect(host.textContent).toContain('Staff Member')
  expect(host.textContent).toContain('20.0h')
  expect(host.textContent).not.toContain('Hourly Rate')
  expect(host.textContent).not.toContain('Hourly Cost')
  ;([...host.querySelectorAll('button')].find(b => b.textContent === 'Edit') as HTMLButtonElement).click()
  await nextTick()
  ;([...host.querySelectorAll('button')].find(b => b.textContent === 'Save Changes') as HTMLButtonElement).click()
  for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick() }
  const body = fetch.mock.calls.find(([,o]) => o?.method === 'PUT')![1].body
  expect(body).not.toHaveProperty('hourlyRate')
  expect(body).not.toHaveProperty('hourlyCost')
})

it('preserves non-admin roster visibility while withholding staff administration controls', async () => {
  vi.stubGlobal('useRoute', () => ({ params: {}, query: { member: 'member' } }))
  fetch.mockResolvedValue({ members: [{ id: 'member', name: 'Staff Member', email: 'staff@example.com', isActive: true, hoursThisMonth: 20, targetUtilization: 120 }] })
  const host = await mount(Team)
  expect(host.textContent).toContain('Staff Member')
  expect(host.textContent).not.toContain('Add Team Member')
  expect([...host.querySelectorAll('button')].some(b => b.textContent === 'Edit')).toBe(false)
})
