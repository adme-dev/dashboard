// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, ref, Suspense, watch, type Component } from 'vue'
import AiInsightsWidget from '../../app/components/dashboard/AiInsightsWidget.vue'
import AiTrainingWidget from '../../app/components/dashboard/AiTrainingWidget.vue'
import BlockedTasksWidget from '../../app/components/dashboard/BlockedTasksWidget.vue'
import BriefsPipelineWidget from '../../app/components/dashboard/BriefsPipelineWidget.vue'
import CampaignAlertsWidget from '../../app/components/dashboard/CampaignAlertsWidget.vue'
import ClientHealthWidget from '../../app/components/dashboard/ClientHealthWidget.vue'
import CompletionTrendsChart from '../../app/components/dashboard/CompletionTrendsChart.client.vue'
import DeliverablesDueWidget from '../../app/components/dashboard/DeliverablesDueWidget.vue'
import JobTypesChart from '../../app/components/dashboard/JobTypesChart.client.vue'
import MyClientsWidget from '../../app/components/dashboard/MyClientsWidget.vue'
import PlatformPerformanceWidget from '../../app/components/dashboard/PlatformPerformanceWidget.client.vue'
import ProjectProfitabilityWidget from '../../app/components/dashboard/ProjectProfitabilityWidget.vue'
import ProofsPendingWidget from '../../app/components/dashboard/ProofsPendingWidget.vue'
import RecentCreativesWidget from '../../app/components/dashboard/RecentCreativesWidget.vue'
import SpendPacingWidget from '../../app/components/dashboard/SpendPacingWidget.vue'
import TeamCapacityWidget from '../../app/components/dashboard/TeamCapacityWidget.vue'
import UnassignedWorkWidget from '../../app/components/dashboard/UnassignedWorkWidget.vue'
import WorkloadChart from '../../app/components/dashboard/WorkloadChart.client.vue'

const widgets: [string, Component][] = [
  ['AiInsightsWidget.vue', AiInsightsWidget],
  ['AiTrainingWidget.vue', AiTrainingWidget],
  ['BlockedTasksWidget.vue', BlockedTasksWidget],
  ['BriefsPipelineWidget.vue', BriefsPipelineWidget],
  ['CampaignAlertsWidget.vue', CampaignAlertsWidget],
  ['ClientHealthWidget.vue', ClientHealthWidget],
  ['CompletionTrendsChart.client.vue', CompletionTrendsChart],
  ['DeliverablesDueWidget.vue', DeliverablesDueWidget],
  ['JobTypesChart.client.vue', JobTypesChart],
  ['MyClientsWidget.vue', MyClientsWidget],
  ['PlatformPerformanceWidget.client.vue', PlatformPerformanceWidget],
  ['ProjectProfitabilityWidget.vue', ProjectProfitabilityWidget],
  ['ProofsPendingWidget.vue', ProofsPendingWidget],
  ['RecentCreativesWidget.vue', RecentCreativesWidget],
  ['SpendPacingWidget.vue', SpendPacingWidget],
  ['TeamCapacityWidget.vue', TeamCapacityWidget],
  ['UnassignedWorkWidget.vue', UnassignedWorkWidget],
  ['WorkloadChart.client.vue', WorkloadChart]
]
const apps: ReturnType<typeof createApp>[] = []
const requests = vi.fn()
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function mount(widget: Component) {
  const host = document.createElement('div')
  document.body.append(host)
  const visible = ref(true)
  const errors: unknown[] = []
  const app = createApp({ render: () => h(Suspense, null, {
    default: () => h('main', [h('h1', 'Dashboard'), visible.value ? h(widget) : h('p', 'Other page')]),
    fallback: () => h('p', 'Waiting for page')
  }) })
  app.config.errorHandler = error => errors.push(error)
  app.component('UCard', { template: '<section><slot name="header"/><slot/><slot name="footer"/></section>' })
  app.component('DashboardWidgetShell', { props: ['title', 'loading'], template: '<section><h2>{{title}}</h2><p v-if="loading">Loading widget</p><slot v-else /></section>' })
  for (const name of ['UButton', 'UIcon', 'UBadge', 'UAvatar', 'NuxtLink', 'USkeleton', 'UProgress', 'NbCard']) {
    app.component(name, { template: '<span><slot /></span>' })
  }
  apps.push(app)
  app.mount(host)
  return { host, visible, errors }
}
beforeEach(() => {
  vi.clearAllMocks()
  Object.entries({ computed, ref, watch, onMounted }).forEach(([name, value]) => vi.stubGlobal(name, value))
  vi.stubGlobal('$fetch', requests)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('dashboard remains usable while widget requests are pending', () => {
  it.each(widgets)('%s keeps the page mounted when its request fails', async (_name, widget) => {
    requests.mockRejectedValue(new Error('Network unavailable'))
    const { host, errors } = mount(widget)
    await flush()
    expect(host.querySelector('h1')?.textContent).toBe('Dashboard')
    expect(errors).toEqual([])
  })
  it('renders a successful delayed response without suspending the page again', async () => {
    let complete!: (value: unknown) => void
    requests.mockReturnValue(new Promise((resolve) => {
      complete = resolve
    }))
    const { host, errors } = mount(MyClientsWidget)
    await flush()
    expect(host.textContent).toContain('Loading widget')
    complete([{ id: 'test-client', name: 'Test Client', status: 'active' }])
    await flush()
    expect(host.textContent).toContain('Test Client')
    expect(host.textContent).not.toContain('Loading widget')
    expect(errors).toEqual([])
  })
  it.each(widgets)('%s does not suspend the page and tolerates navigation before completion', async (_name, widget) => {
    let complete!: (value: unknown) => void
    const pending = new Promise((resolve) => {
      complete = resolve
    })
    requests.mockReturnValue(pending)
    const { host, visible, errors } = mount(widget)
    await flush()
    expect(host.querySelector('h1')?.textContent).toBe('Dashboard')
    expect(requests).toHaveBeenCalled()
    visible.value = false
    await flush()
    expect(host.textContent).toContain('Other page')
    complete({})
    await flush()
    expect(errors).toEqual([])
    expect(host.textContent).toContain('Other page')
  })
})
