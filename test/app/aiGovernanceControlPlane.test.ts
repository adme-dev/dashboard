// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, Suspense, watch } from 'vue'
import EvaluationRunPanel from '~~/app/components/ai/governance/EvaluationRunPanel.vue'
import CatalogReleasePanel from '~~/app/components/ai/governance/CatalogReleasePanel.vue'
import PilotMembershipDialog from '~~/app/components/ai/governance/PilotMembershipDialog.vue'
import DepartmentPackReadinessList from '~~/app/components/ai/DepartmentPackReadinessList.vue'
import RolloutReadinessPanel from '~~/app/components/ai/governance/RolloutReadinessPanel.vue'
import type { AiCatalogGovernanceItem, AiDepartmentReadinessItem, AiEvaluationRunView } from '~~/app/types/aiGovernance'

Object.assign(globalThis, { computed, definePageMeta: vi.fn(), reactive, ref, watch })

const stubs = {
  UModal: { props: ['open', 'title', 'description'], emits: ['update:open'], template: '<section v-if="open" role="dialog"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /></section>' },
  UAlert: { props: ['title', 'description'], template: '<aside role="alert"><strong>{{ title }}</strong><span>{{ description }}</span><slot /><slot name="actions" /></aside>' },
  UCard: { template: '<article><slot /></article>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  USkeleton: { template: '<div aria-busy="true" />' },
  UFormField: { props: ['label', 'help'], template: '<label><span>{{ label }}</span><slot /><small>{{ help }}</small></label>' },
  UInput: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input v-bind="$attrs" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UTextarea: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea v-bind="$attrs" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UCheckbox: { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>' },
  USelectMenu: { props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], template: '<select v-bind="$attrs" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in items" :key="option.value" :value="option.value">{{ option.label }}</option></select>' },
  UButton: { props: ['disabled', 'loading'], emits: ['click'], template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>' }
}

const item = (key = 'pack-a', releaseId = '90000000-0000-4000-8000-000000000001'): AiCatalogGovernanceItem => ({
  kind: 'pack', id: `entity-${key}`, key, name: key, description: 'Governed pack.',
  department: { id: '10000000-0000-4000-8000-000000000001', name: 'Marketing', slug: 'marketing' },
  owner: { id: '20000000-0000-4000-8000-000000000001', name: 'Owner' },
  version: { id: `version-${key}`, number: 1, label: null },
  release: { id: releaseId, state: 'pilot', rolloutScope: 'pilot', evaluationRunId: null, evaluationGatePassed: null, reason: 'Seeded', changedBy: 'actor', createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z' },
  evaluation: null,
  controls: { modelFeatureKey: `feature-${key}`, permissionGroup: null, riskClass: null, dataClass: null, approvalMode: null, maxInputTokens: 100, maxOutputTokens: 100, maxCostUsdMicros: 50, maxLatencyMs: 500, capabilityCount: 1, toolCount: 0, toolNames: [], toolsTruncated: false }
})

const readinessItem = (packKey: string): AiDepartmentReadinessItem => ({
  key: packKey, packKey, name: packKey, description: 'Pack', status: 'draft_seeded', releaseState: 'pilot', blockers: [],
  department: { id: '10000000-0000-4000-8000-000000000001', name: 'Marketing', slug: 'marketing' }, departmentMatches: [], ownerCandidate: null,
  ownerCandidates: [], coverage: { capabilities: 1, tools: 1, evaluationCases: 2 }, knownGaps: []
})

async function flush() { for (let index = 0; index < 8; index += 1) { await Promise.resolve(); await nextTick() } }
function click(host: HTMLElement, text: string) { Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes(text))?.dispatchEvent(new MouseEvent('click', { bubbles: true })) }
function clickLast(host: HTMLElement, text: string) { Array.from(host.querySelectorAll('button')).filter(button => button.textContent?.includes(text)).at(-1)?.dispatchEvent(new MouseEvent('click', { bubbles: true })) }
function input(host: HTMLElement, label: string, value: string) { const field = Array.from(host.querySelectorAll('label')).find(node => node.textContent?.includes(label))?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })) }
function check(host: HTMLElement, text: string) { const field = Array.from(host.querySelectorAll('label')).find(node => node.textContent?.includes(text))?.querySelector('input[type="checkbox"]') as HTMLInputElement; field.checked = true; field.dispatchEvent(new Event('change', { bubbles: true })) }
function mount(component: unknown, props: Record<string, unknown>, fetchMock = vi.fn(), components: Record<string, unknown> = {}) {
  ;(globalThis as any).$fetch = fetchMock
  const host = document.createElement('div'); document.body.appendChild(host)
  const app = createApp({ render: () => h(component as never, props) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  Object.entries(components).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host, fetchMock }
}

describe('AI governance command centre', () => {
  it('uses the exact current model assignment for preflight then renders and locks the returned terminal run', async () => {
    const evaluation = item()
    const changed = vi.fn()
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/admin/ai/model-ops/model-map') return { rows: [{ featureKey: evaluation.controls.modelFeatureKey, assignedProvider: 'anthropic', assignedModelId: 'claude-sonnet-4-6' }] }
      if (url === '/api/admin/ai/governance/evaluations') return { evaluationRunId: 'run-1', departmentId: evaluation.department.id, planDigest: 'a'.repeat(64), rateCardId: 'rate-1', estimatedUpperBoundUsdMicros: 100, maxModelCalls: 2, decision: 'requires_cost_approval' }
      if (url.endsWith('/approve')) return { approvalId: 'approval-1' }
      if (url.endsWith('/run')) return { id: 'run-1', departmentId: evaluation.department.id, materialIdentity: { packVersionId: evaluation.version.id, capabilityVersionId: null, evaluationSuiteVersionId: 'suite-1', modelProvider: 'anthropic', modelId: 'claude-sonnet-4-6', promptVersionDigest: 'a'.repeat(64), toolsetVersionDigest: 'b'.repeat(64) }, status: 'completed', gatePassed: true, caseCount: 2, passedCount: 2, failedCount: 0, humanReviewCount: 0, totalInputTokens: 20, totalOutputTokens: 10, totalCostUsdMicros: 100, startedAt: null, completedAt: '2026-08-03T00:00:01.000Z', createdAt: '2026-08-03T00:00:00.000Z' }
      throw new Error(`Unexpected request ${url}`)
    })
    const { app, host } = mount(EvaluationRunPanel, { item: evaluation, runs: [], defaultCaseCount: 2, onChanged: changed }, fetchMock)
    click(host, 'Run evaluation'); await flush(); click(host, 'Preflight evaluation'); await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/governance/evaluations', expect.objectContaining({ body: expect.objectContaining({ modelProvider: 'anthropic', modelId: 'claude-sonnet-4-6' }) }))
    input(host, 'Audit reason', 'Approved exact assignment evaluation cost.'); check(host, 'I approve this maximum evaluation spend.'); await flush(); click(host, 'Approve cost'); await flush(); click(host, 'Execute approved evaluation'); await flush(); click(host, 'Execute approved evaluation'); await flush()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/run'))).toHaveLength(1)
    expect(host.textContent).toContain('Latest result'); expect(host.textContent).toContain('2 passed'); expect(changed).toHaveBeenCalledTimes(1)
    app.unmount(); host.remove()
  })

  it('shows an observable model-assignment error and keeps preflight disabled when the exact assignment is unavailable', async () => {
    const { app, host } = mount(EvaluationRunPanel, { item: item(), runs: [], defaultCaseCount: 2 }, vi.fn(async () => ({ rows: [] })))
    click(host, 'Run evaluation'); await flush()
    expect(host.textContent).toContain('Current model assignment unavailable')
    expect(Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Preflight evaluation'))?.disabled).toBe(true)
    app.unmount(); host.remove()
  })

  it('refreshes after a release conflict and retries with the current expected timestamp', async () => {
    const state = reactive({ value: item() }); const changed = vi.fn()
    let attempts = 0
    const fetchMock = vi.fn(async () => { attempts += 1; if (attempts === 1) throw { data: { data: { code: 'release_version_conflict' }, statusMessage: 'Changed' } }; return { release: {} } })
    ;(globalThis as any).$fetch = fetchMock
    const host = document.createElement('div'); document.body.appendChild(host)
    const app = createApp({ render: () => h(CatalogReleasePanel, { item: state.value, runs: [], onChanged: changed }) }); Object.entries(stubs).forEach(([name, component]) => app.component(name, component)); app.mount(host)
    click(host, 'Suspend release'); await flush(); input(host, 'Audit reason', 'Suspend while fresh evidence is reviewed.'); check(host, 'I confirm this release transition'); await flush(); const firstSubmit = Array.from(host.querySelectorAll('button')).filter(button => button.textContent?.includes('Suspend release')).at(-1)!; expect(firstSubmit.disabled).toBe(false); firstSubmit.click(); await flush()
    expect(attempts).toBe(1); expect(changed).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('Release changed by another admin')
    state.value = { ...state.value, release: { ...state.value.release, updatedAt: '2026-08-03T00:01:00.000Z' } }; await flush(); click(host, 'Suspend release'); await flush(); input(host, 'Audit reason', 'Suspend after reviewing the current release.'); check(host, 'I confirm this release transition'); await flush(); const retrySubmit = Array.from(host.querySelectorAll('button')).filter(button => button.textContent?.includes('Suspend release')).at(-1)!; expect(retrySubmit.disabled).toBe(false); retrySubmit.click(); await flush()
    expect(fetchMock.mock.calls[1]?.[1].body.expectedUpdatedAt).toBe('2026-08-03T00:01:00.000Z'); expect(changed).toHaveBeenCalledTimes(2)
    app.unmount(); host.remove()
  })

  it('uses a non-empty pilot sentinel and excludes already enrolled members before allowing an audited selection', async () => {
    const pilot = item(); const fetchMock = vi.fn(async () => ({ memberships: [{ id: 'membership-1', releaseId: pilot.release.id, kind: 'pack', departmentId: pilot.department.id, memberUserId: 'member-1', memberName: 'Already enrolled', assignedAt: '2026-08-03T00:00:00.000Z', eligible: true }] }))
    const { app, host } = mount(PilotMembershipDialog, { item: pilot, candidates: [{ id: 'member-1', name: 'Already enrolled', source: 'department_member', membershipRole: 'member', isManager: false, eligible: true }, { id: 'member-2', name: 'Available member', source: 'department_member', membershipRole: 'member', isManager: false, eligible: true }] }, fetchMock)
    click(host, 'Manage pilot members'); await flush()
    const select = host.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('__select_member__'); expect(Array.from(select.options).map(option => option.value)).not.toContain('member-1'); expect(Array.from(select.options).map(option => option.value)).toContain('member-2')
    app.unmount(); host.remove()
  })

  it('keeps an ineligible active membership visible and revocable while excluding it from new enrollment', async () => {
    const pilot = item()
    const staleMembership = { id: 'membership-stale', releaseId: pilot.release.id, kind: 'pack' as const, departmentId: pilot.department.id, memberUserId: 'member-stale', memberName: 'Former department member', assignedAt: '2026-08-03T00:00:00.000Z', eligible: false }
    const fetchMock = vi.fn(async (_url: string, options?: { method?: string }) => {
      if (options?.method === 'DELETE') return { removed: true }
      return { memberships: [staleMembership] }
    })
    const { app, host } = mount(PilotMembershipDialog, {
      item: pilot,
      candidates: [
        { id: 'member-stale', name: 'Former department member', source: 'department_member', membershipRole: 'member', isManager: false, eligible: false },
        { id: 'member-current', name: 'Current department member', source: 'department_member', membershipRole: 'member', isManager: false, eligible: true }
      ]
    }, fetchMock)

    click(host, 'Manage pilot members'); await flush()

    expect(host.textContent).toContain('Former department member')
    expect(host.textContent).toContain('Stale / ineligible')
    const select = host.querySelector('select') as HTMLSelectElement
    expect(Array.from(select.options).map(option => option.value)).not.toContain('member-stale')
    expect(Array.from(select.options).map(option => option.value)).toContain('member-current')

    click(host, 'Revoke'); await flush()
    input(host, 'Audit reason', 'Revoke stale membership after department departure.')
    check(host, 'I confirm this pilot access revocation.')
    await flush()
    const revoke = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Confirm revoke'))!
    expect(revoke.disabled).toBe(false)
    revoke.click(); await flush()

    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/ai/governance/releases/${pilot.release.id}/pilots`, expect.objectContaining({
      method: 'DELETE',
      body: { kind: 'pack', memberUserId: 'member-stale', reason: 'Revoke stale membership after department departure.' }
    }))
    app.unmount(); host.remove()
  })

  it('binds same-department controls to the canonical pack key and gives every repeated panel a unique heading id', async () => {
    const captured: Record<string, any[]> = { evaluation: [], pilot: [], release: [] }
    const children = {
      AiGovernanceEvaluationRunPanel: { props: ['item', 'headingId'], setup(props: any) { captured.evaluation.push(props); return () => h('div', { id: props.headingId }, props.item.release.id) } },
      AiGovernancePilotMembershipDialog: { props: ['item', 'headingId'], setup(props: any) { captured.pilot.push(props); return () => h('div', { id: props.headingId }, props.item.release.id) } },
      AiGovernanceCatalogReleasePanel: { props: ['item', 'headingId'], setup(props: any) { captured.release.push(props); return () => h('div', { id: props.headingId }, props.item.release.id) } }
    }
    const { app, host } = mount(DepartmentPackReadinessList, { items: [readinessItem('pack-a'), readinessItem('pack-b')], catalogItems: [item('pack-a', 'release-a'), item('pack-b', 'release-b')], evaluationRuns: [] }, vi.fn(), children)
    await flush()
    expect(host.textContent).toContain('release-a'); expect(host.textContent).toContain('release-b'); expect(new Set(Array.from(host.querySelectorAll('[id]')).map(node => node.id)).size).toBe(Array.from(host.querySelectorAll('[id]')).length)
    app.unmount(); host.remove()
  })

  it('keeps known release controls visible while showing a retryable stale catalog warning', async () => {
    const retried = vi.fn()
    const children = {
      AiGovernanceEvaluationRunPanel: { props: ['item'], template: '<div>Evaluation {{ item.release.id }}</div>' },
      AiGovernancePilotMembershipDialog: { props: ['item'], template: '<div>Pilots {{ item.release.id }}</div>' },
      AiGovernanceCatalogReleasePanel: { props: ['item'], template: '<div>Release {{ item.release.id }}</div>' }
    }
    const { app, host } = mount(DepartmentPackReadinessList, { items: [readinessItem('pack-a')], catalogItems: [item('pack-a', 'release-a')], evaluationRuns: [], catalogError: 'Catalog refresh failed', onRetryCatalog: retried }, vi.fn(), children)
    await flush(); expect(host.textContent).toContain('Catalog data may be stale'); expect(host.textContent).toContain('Release release-a'); click(host, 'Retry catalog'); expect(retried).toHaveBeenCalledTimes(1)
    app.unmount(); host.remove()
  })

  it('fails pilot promotion closed while evaluation evidence is pending or unavailable, without disabling suspend', async () => {
    const passingRun: AiEvaluationRunView = {
      id: 'passing-run', departmentId: item().department.id,
      materialIdentity: { packVersionId: item().version.id, capabilityVersionId: null, evaluationSuiteVersionId: 'suite-1', modelProvider: 'anthropic', modelId: 'claude-sonnet-4-6', promptVersionDigest: 'a'.repeat(64), toolsetVersionDigest: 'b'.repeat(64) },
      status: 'completed', gatePassed: true, caseCount: 2, passedCount: 2, failedCount: 0, humanReviewCount: 0, totalInputTokens: 2, totalOutputTokens: 2, totalCostUsdMicros: 10, startedAt: null, completedAt: '2026-08-03T00:00:01.000Z', createdAt: '2026-08-03T00:00:00.000Z'
    }
    const fetchMock = vi.fn(async () => ({ release: {} }))
    const { app, host } = mount(CatalogReleasePanel, { item: item(), runs: [passingRun], evidenceUnavailable: true }, fetchMock)
    const pilot = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Activate release'))!
    const suspend = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Suspend release'))!
    expect(pilot.disabled).toBe(true)
    expect(suspend.disabled).toBe(false)
    click(host, 'Suspend release'); await flush(); input(host, 'Audit reason', 'Suspend while fresh evaluation evidence is unavailable.'); check(host, 'I confirm this release transition'); await flush(); clickLast(host, 'Suspend release'); await flush()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/releases/'), expect.objectContaining({ body: expect.objectContaining({ targetState: 'suspended' }) }))
    app.unmount(); host.remove()
  })

  it('marks release evidence unavailable for both pending and stale-error evaluation resources', async () => {
    const captured: boolean[] = []
    const children = {
      AiGovernanceEvaluationRunPanel: { template: '<div />' },
      AiGovernancePilotMembershipDialog: { template: '<div />' },
      AiGovernanceCatalogReleasePanel: { props: ['evidenceUnavailable'], setup(props: any) { captured.push(props.evidenceUnavailable); return () => h('div') } }
    }
    const pending = mount(DepartmentPackReadinessList, { items: [readinessItem('pack-a')], catalogItems: [item('pack-a')], evaluationRuns: [], evaluationsPending: true }, vi.fn(), children)
    await flush(); pending.app.unmount(); pending.host.remove()
    const failed = mount(DepartmentPackReadinessList, { items: [readinessItem('pack-a')], catalogItems: [item('pack-a')], evaluationRuns: [], evaluationsError: 'Latest evaluation refresh failed' }, vi.fn(), children)
    await flush(); failed.app.unmount(); failed.host.remove()
    expect(captured).toEqual([true, true])
  })

  it('explains why release controls are unavailable when no exact catalog identity was returned', async () => {
    const retried = vi.fn()
    const { app, host } = mount(DepartmentPackReadinessList, { items: [readinessItem('pack-a')], catalogItems: [], evaluationRuns: [], onRetryCatalog: retried })
    await flush()
    expect(host.textContent).toContain('Catalog controls unavailable')
    expect(host.textContent).toContain('exact catalog release identity')
    click(host, 'Retry catalog')
    expect(retried).toHaveBeenCalledTimes(1)
    app.unmount(); host.remove()
  })

  it('requests bounded pack-only catalog pages while preserving independent page resources', async () => {
    const calls: Array<[string, any]> = []
    ;(globalThis as any).$fetch = vi.fn(async (url: string, options?: any) => {
      calls.push([url, options])
      if (url.endsWith('/readiness')) return { summary: { total: 0, readyForOwnerConfirmation: 0, blocked: 0, missingDepartments: 0, draftSeeded: 0, released: 0 }, items: [], unmappedDepartments: [] }
      if (url.endsWith('/catalog')) return options?.query?.cursor ? { items: [], nextCursor: null } : { items: [], nextCursor: 'next-page' }
      if (url.endsWith('/evaluations')) return { items: [] }
      if (url.endsWith('/rollout')) return { readyForPilot: false, readyForEnforcement: false, activeEmployeeCount: 0, coveredEmployeeCount: 0, uncoveredEmployees: [], departmentCoverage: [], blockers: [] }
      throw new Error(`Unexpected ${url}`)
    })
    vi.resetModules(); const GovernancePage = (await import('~~/app/pages/admin/ai/governance.vue')).default
    const host = document.createElement('div'); document.body.appendChild(host)
    const app = createApp({ render: () => h(Suspense, null, { default: () => h(GovernancePage), fallback: () => h('div', 'Loading') }) })
    Object.entries({ ...stubs, AiDepartmentPackReadinessList: { template: '<div />' }, AiDepartmentDraftSeedDialog: { template: '<div />' }, AiGovernanceRolloutReadinessPanel: { template: '<div />' } }).forEach(([name, component]) => app.component(name, component))
    app.mount(host); await flush()
    const catalogCalls = calls.filter(([url]) => url.endsWith('/catalog'))
    expect(catalogCalls).toHaveLength(2); expect(catalogCalls[0]?.[1].query).toMatchObject({ kind: 'pack', limit: 100 }); expect(catalogCalls[1]?.[1].query.cursor).toBe('next-page')
    app.unmount(); host.remove()
  })

  it('keeps readiness data visible and marks it stale when a retry fails', async () => {
    let readinessCalls = 0
    ;(globalThis as any).$fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/readiness')) { readinessCalls += 1; if (readinessCalls > 1) throw { data: { statusMessage: 'Readiness refresh failed' } }; return { summary: { total: 0, readyForOwnerConfirmation: 0, blocked: 0, missingDepartments: 0, draftSeeded: 0, released: 0 }, items: [], unmappedDepartments: [] } }
      if (url.endsWith('/catalog')) return { items: [], nextCursor: null }
      if (url.endsWith('/evaluations')) return { items: [] }
      if (url.endsWith('/rollout')) return { readyForPilot: false, readyForEnforcement: false, activeEmployeeCount: 0, coveredEmployeeCount: 0, uncoveredEmployees: [], departmentCoverage: [], blockers: [] }
      throw new Error(`Unexpected ${url}`)
    })
    vi.resetModules(); const GovernancePage = (await import('~~/app/pages/admin/ai/governance.vue')).default
    const host = document.createElement('div'); document.body.appendChild(host)
    const app = createApp({ render: () => h(Suspense, null, { default: () => h(GovernancePage), fallback: () => h('div', 'Loading') }) })
    Object.entries({ ...stubs, AiDepartmentPackReadinessList: { template: '<div />' }, AiDepartmentDraftSeedDialog: { template: '<div />' }, AiGovernanceRolloutReadinessPanel: { template: '<div />' } }).forEach(([name, component]) => app.component(name, component))
    app.mount(host); await flush(); click(host, 'Refresh'); await flush()
    expect(host.textContent).toContain('Readiness data may be stale'); expect(host.textContent).toContain('Readiness refresh failed')
    app.unmount(); host.remove()
  })

  it('renders loading, retryable error, and privacy-safe rollout states', async () => {
    const refreshed = vi.fn(); const { app, host } = mount(RolloutReadinessPanel, { data: null, pending: false, error: 'Readiness failed', onRefresh: refreshed })
    expect(host.textContent).toContain('Rollout readiness unavailable'); click(host, 'Try again'); expect(refreshed).toHaveBeenCalledTimes(1)
    app.unmount(); host.remove()

    const privacy = mount(RolloutReadinessPanel, { data: { readyForPilot: false, readyForEnforcement: false, activeEmployeeCount: 1, coveredEmployeeCount: 0, uncoveredEmployees: [{ name: 'Taylor Staff', reasons: ['no_department'], email: 'taylor@example.test', recentActivity: 'private activity' }], departmentCoverage: [], blockers: [] } as any, pending: false, error: null })
    expect(privacy.host.textContent).toContain('Taylor Staff')
    expect(privacy.host.textContent).not.toContain('taylor@example.test')
    expect(privacy.host.textContent).not.toContain('private activity')
    privacy.app.unmount(); privacy.host.remove()
  })
})
