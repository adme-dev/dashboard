// @vitest-environment happy-dom
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PilotMetricsPanel from '~~/app/components/ai/governance/PilotMetricsPanel.vue'

const stubs = {
  UAlert: { props: ['title', 'description'], template: '<div><strong>{{ title }}</strong><span>{{ description }}</span><slot /><slot name="actions" /></div>' },
  UBadge: { template: '<span><slot /></span>' },
  UButton: { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
  UCard: { template: '<article><slot /></article>' },
  UFormField: { props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UIcon: { template: '<span />' },
  UPopover: { template: '<div><slot /><slot name="content" /></div>' },
  UCalendar: { props: ['modelValue'], emits: ['update:modelValue'], template: '<div>Calendar</div>' },
  USkeleton: { template: '<div>Loading evidence</div>' }
}

const WINDOW = { from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T00:00:00.000Z' }
const passingMetric = {
  releaseId: 'release-1', packKey: 'paid_media_read_draft', cohort: 'paid_media', window: WINDOW,
  eligibleUsers: 6, activeUsers: 5, successfulTurns: 20, failedTurns: 1,
  p50LatencyMs: 500, p95LatencyMs: 900, totalCostUsdMicros: 1_000,
  usefulFeedbackRate: 0.9, ratingCount: 10, scopeViolationCount: 0, approvalBypassCount: 0,
  prohibitedEffectCount: 0, gate: 'pass', blockers: []
}

async function flush() { for (let index = 0; index < 8; index += 1) { await Promise.resolve(); await nextTick() } }

function mount(props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(PilotMetricsPanel, props) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('AI governance pilot metrics UI', () => {
  it('renders loading, retryable error, empty, and stale states without blank content', () => {
    const retry = vi.fn()
    const loading = mount({ data: null, window: WINDOW, pending: true, error: null })
    expect(loading.host.textContent).toContain('Loading evidence')
    loading.app.unmount()

    const failed = mount({ data: null, window: WINDOW, pending: false, error: 'Evidence refresh failed', onRefresh: retry })
    expect(failed.host.textContent).toContain('Pilot evidence unavailable')
    failed.host.querySelector('button')?.click()
    expect(retry).toHaveBeenCalledOnce()
    failed.app.unmount()

    const empty = mount({ data: { generatedAt: '2026-08-03T00:00:00.000Z', window: WINDOW, summary: { gate: 'insufficient_data', blockers: ['required_pilot_releases_missing'], requiredPackCount: 5, presentReleaseCount: 0 }, metrics: [] }, window: WINDOW, pending: false, error: null })
    expect(empty.host.textContent).toContain('Required pilot evidence is missing')
    empty.app.unmount()

    const stale = mount({ data: { generatedAt: '2026-08-03T00:00:00.000Z', window: WINDOW, summary: { gate: 'pass', blockers: [], requiredPackCount: 5, presentReleaseCount: 5 }, metrics: [passingMetric] }, window: WINDOW, pending: false, error: 'Refresh failed' })
    expect(stale.host.textContent).toContain('Pilot evidence may be stale')
    expect(stale.host.textContent).toContain('20')
    stale.app.unmount()
  })

  it('shows cohort totals, thresholds, blockers, and zero-tolerance evidence without employee comparison', () => {
    const result = mount({
      data: {
        generatedAt: '2026-08-03T00:00:00.000Z', window: WINDOW,
        summary: { gate: 'fail', blockers: ['representative_evidence_caller_unavailable'], requiredPackCount: 5, presentReleaseCount: 5 },
        metrics: [{ ...passingMetric, gate: 'fail', blockers: ['scope_violation_detected'], scopeViolationCount: 1 }]
      },
      window: WINDOW,
      pending: false,
      error: null
    })
    const text = result.host.textContent ?? ''

    expect(text).toContain('Paid media')
    expect(text).toContain('20 successful tasks required')
    expect(text).toContain('80% useful at 10+ ratings')
    expect(text).toContain('Zero tolerance')
    expect(text).toContain('Evidence from')
    expect(text).toContain('Evidence through')
    expect(text).toContain('Representative evidence caller unavailable')
    expect(text).toContain('Scope violation detected')
    for (const forbidden of ['leaderboard', 'employee ranking', 'user id', 'Taylor', 'email', 'prompt', 'response', 'memory', 'trace', 'token']) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    result.app.unmount()
  })

  it('loads a bounded default window on the governance page and retains stale metrics after retry failure', async () => {
    let pilotCalls = 0
    let firstPilotQuery: any
    ;(globalThis as any).definePageMeta = vi.fn()
    ;(globalThis as any).ref = ref
    ;(globalThis as any).computed = computed
    ;(globalThis as any).useRoute = () => ({ query: {} })
    ;(globalThis as any).useRouter = () => ({ replace: vi.fn() })
    ;(globalThis as any).$fetch = vi.fn(async (url: string, options?: any) => {
      if (url.endsWith('/readiness')) return { summary: { total: 0, readyForOwnerConfirmation: 0, blocked: 0, missingDepartments: 0, draftSeeded: 0, released: 0 }, items: [], unmappedDepartments: [] }
      if (url.endsWith('/catalog')) return { items: [], nextCursor: null }
      if (url.endsWith('/evaluations')) return { items: [] }
      if (url.endsWith('/rollout')) return { readyForPilot: false, readyForEnforcement: false, activeEmployeeCount: 0, coveredEmployeeCount: 0, uncoveredEmployees: [], departmentCoverage: [], blockers: [] }
      if (url.endsWith('/pilot-metrics')) {
        pilotCalls += 1
        expect(options.query.from).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(options.query.to).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        if (!firstPilotQuery) firstPilotQuery = { ...options.query }
        else expect(options.query).toEqual(firstPilotQuery)
        if (pilotCalls > 1) throw { data: { statusMessage: 'Pilot refresh failed' } }
        return { generatedAt: '2026-08-03T00:00:00.000Z', window: WINDOW, summary: { gate: 'pass', blockers: [], requiredPackCount: 5, presentReleaseCount: 5 }, metrics: [passingMetric] }
      }
      throw new Error(`Unexpected ${url}`)
    })
    vi.resetModules()
    const GovernancePage = (await import('~~/app/pages/admin/ai/governance.vue')).default
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(Suspense, null, { default: () => h(GovernancePage), fallback: () => h('div', 'Loading') }) })
    Object.entries({
      ...stubs,
      AiDepartmentPackReadinessList: { template: '<div />' },
      AiDepartmentDraftSeedDialog: { template: '<div />' },
      AiGovernanceRolloutReadinessPanel: { template: '<div />' },
      AiGovernancePilotMetricsPanel: {
        props: ['data', 'window', 'pending', 'error'],
        emits: ['refresh', 'apply-window'],
        template: '<div><span>{{ data?.metrics?.[0]?.successfulTurns }}</span><span>{{ error }}</span><button @click="$emit(\'refresh\')">Refresh pilot evidence</button></div>'
      }
    }).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    await flush()
    expect(host.textContent).toContain('20')
    Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Refresh pilot evidence'))?.click()
    await flush()
    expect(host.textContent).toContain('20')
    expect(host.textContent).toContain('Pilot refresh failed')
    app.unmount()
  })
})
