// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, watch } from 'vue'
import DepartmentDraftSeedDialog from '~~/app/components/ai/DepartmentDraftSeedDialog.vue'
import EvaluationRunPanel from '~~/app/components/ai/governance/EvaluationRunPanel.vue'
import CatalogReleasePanel from '~~/app/components/ai/governance/CatalogReleasePanel.vue'
import PilotMembershipDialog from '~~/app/components/ai/governance/PilotMembershipDialog.vue'
import type { AiCatalogGovernanceItem, AiDepartmentReadinessItem } from '~~/app/types/aiGovernance'

Object.assign(globalThis, { computed, reactive, ref, watch })

const stubs = {
  UModal: { props: ['open'], template: '<section v-if="open" role="dialog"><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { props: ['label', 'help'], template: '<label><span>{{ label }}</span><slot /><small>{{ help }}</small></label>' },
  UAlert: { props: ['title', 'description'], template: '<aside><strong>{{ title }}</strong><span>{{ description }}</span><slot /></aside>' },
  UTextarea: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  USelectMenu: { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in items" :key="option.value" :value="option.value">{{ option.label }}</option></select>' },
  UCheckbox: { props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>' },
  UButton: { props: ['disabled'], emits: ['click'], template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>' },
  UBadge: { template: '<span><slot /></span>' }, UIcon: { template: '<i />' }, USkeleton: { template: '<div />' }
}

const item: AiDepartmentReadinessItem = { key: 'marketing', packKey: 'pack-a', name: 'Marketing', description: 'Pack', status: 'ready_for_owner_confirmation', releaseState: 'not_seeded', blockers: [], department: { id: '10000000-0000-4000-8000-000000000001', name: 'Marketing', slug: 'marketing' }, departmentMatches: [], ownerCandidate: { id: '20000000-0000-4000-8000-000000000001', name: 'Owner', source: 'department_member' }, ownerCandidates: [], coverage: { capabilities: 1, tools: 1, evaluationCases: 1 }, knownGaps: [] }
async function flush() { for (let i = 0; i < 4; i += 1) { await Promise.resolve(); await nextTick() } }
function click(host: HTMLElement, text: string) { Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes(text))?.dispatchEvent(new MouseEvent('click', { bubbles: true })) }
function clickLast(host: HTMLElement, text: string) { Array.from(host.querySelectorAll('button')).filter(button => button.textContent?.includes(text)).at(-1)?.dispatchEvent(new MouseEvent('click', { bubbles: true })) }
function input(host: HTMLElement, label: string, value: string) { const field = Array.from(host.querySelectorAll('label')).find(node => node.textContent?.includes(label))?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })) }
function check(host: HTMLElement, text: string) { const field = Array.from(host.querySelectorAll('label')).find(node => node.textContent?.includes(text))?.querySelector('input[type="checkbox"]') as HTMLInputElement; field.checked = true; field.dispatchEvent(new Event('change', { bubbles: true })) }
function mount(component: unknown, props: Record<string, unknown>, fetchMock = vi.fn()) {
  ;(globalThis as any).$fetch = fetchMock
  const host = document.createElement('div'); document.body.appendChild(host)
  const app = createApp({ render: () => h(component as never, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host, fetchMock }
}

const governanceItem: AiCatalogGovernanceItem = {
  kind: 'pack', id: 'entity-a', key: 'pack-a', name: 'Pack A', description: 'Pack',
  department: { id: '10000000-0000-4000-8000-000000000001', name: 'Marketing', slug: 'marketing' }, owner: { id: 'owner-a', name: 'Owner' }, version: { id: 'version-a', number: 1, label: null },
  release: { id: 'release-a', state: 'pilot', rolloutScope: 'pilot', evaluationRunId: null, evaluationGatePassed: null, reason: 'Seeded', changedBy: 'actor', createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z' }, evaluation: null,
  controls: { modelFeatureKey: 'feature-a', permissionGroup: null, riskClass: null, dataClass: null, approvalMode: null, maxInputTokens: 100, maxOutputTokens: 100, maxCostUsdMicros: 50, maxLatencyMs: 500, capabilityCount: 1, toolCount: 0, toolNames: [], toolsTruncated: false }
}

describe('AI governance forms', () => {
  it('renders labelled Nuxt UI controls and keeps the write disabled until an audit reason and explicit confirmation exist', async () => {
    const onSeed = vi.fn(async () => ({ outcome: 'created' as const, releaseState: 'draft' as const })); const host = document.createElement('div'); document.body.appendChild(host)
    const app = createApp({ render: () => h(DepartmentDraftSeedDialog, { open: true, item, onSeed }) }); Object.entries(stubs).forEach(([name, component]) => app.component(name, component)); app.mount(host)
    const submit = host.querySelector('[data-testid="seed-draft-submit"]') as HTMLButtonElement
    expect(Array.from(host.querySelectorAll('label')).map(label => label.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Audit reason'), expect.stringContaining('Confirmation')]))
    expect(submit.disabled).toBe(true); expect(host.querySelectorAll('input, textarea')).toHaveLength(2)
    app.unmount(); host.remove(); await flush()
  })

  it('gates evaluation cost approval with labelled audit controls and submits the exact approved plan', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/admin/ai/model-ops/model-map') return { rows: [{ featureKey: 'feature-a', assignedProvider: 'anthropic', assignedModelId: 'claude-sonnet-4-6' }] }
      if (url === '/api/admin/ai/governance/evaluations') return { evaluationRunId: 'run-a', departmentId: governanceItem.department.id, planDigest: 'a'.repeat(64), rateCardId: 'rate-a', estimatedUpperBoundUsdMicros: 100, maxModelCalls: 2, decision: 'requires_cost_approval' }
      if (url.endsWith('/approve')) return { approvalId: 'approval-a' }
      throw new Error(`Unexpected request ${url}`)
    })
    const { app, host } = mount(EvaluationRunPanel, { item: governanceItem, runs: [], defaultCaseCount: 2 }, fetchMock)
    click(host, 'Run evaluation'); await flush(); click(host, 'Preflight evaluation'); await flush()
    expect(Array.from(host.querySelectorAll('label')).map(label => label.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Audit reason'), expect.stringContaining('Confirmation')]))
    const approve = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Approve cost'))!
    expect(approve.disabled).toBe(true); input(host, 'Audit reason', 'Approve this exact bounded evaluation spend.'); check(host, 'I approve this maximum evaluation spend.'); await flush(); expect(approve.disabled).toBe(false); click(host, 'Approve cost'); await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/governance/evaluations/run-a/approve', expect.objectContaining({ body: expect.objectContaining({ planDigest: 'a'.repeat(64), maxSpendUsdMicros: 100, reason: 'Approve this exact bounded evaluation spend.' }) }))
    app.unmount(); host.remove()
  })

  it('gates release transition confirmation and submits its exact optimistic-concurrency payload', async () => {
    const fetchMock = vi.fn(async () => ({ release: {} }))
    const { app, host } = mount(CatalogReleasePanel, { item: governanceItem, runs: [] }, fetchMock)
    click(host, 'Suspend release'); await flush()
    expect(Array.from(host.querySelectorAll('label')).map(label => label.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Audit reason'), expect.stringContaining('Confirmation')]))
    const submit = Array.from(host.querySelectorAll('button')).filter(button => button.textContent?.includes('Suspend release')).at(-1)!
    expect(submit.disabled).toBe(true); input(host, 'Audit reason', 'Suspend while remediation is underway.'); check(host, 'I confirm this release transition'); await flush(); expect(submit.disabled).toBe(false); clickLast(host, 'Suspend release'); await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/governance/releases/release-a', expect.objectContaining({ body: { kind: 'pack', targetState: 'suspended', evaluationRunId: null, expectedUpdatedAt: '2026-08-03T00:00:00.000Z', reason: 'Suspend while remediation is underway.' } }))
    app.unmount(); host.remove()
  })

  it('uses a non-empty pilot sentinel, labelled gates, and an exact membership payload', async () => {
    const fetchMock = vi.fn(async (url: string, options?: any) => {
      if (options?.method === 'POST') return {}
      return { memberships: [] }
    })
    const { app, host } = mount(PilotMembershipDialog, { item: governanceItem, candidates: [{ id: 'member-a', name: 'Active member', source: 'department_member', membershipRole: 'member', isManager: false, eligible: true }] }, fetchMock)
    click(host, 'Manage pilot members'); await flush()
    const select = host.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('__select_member__'); expect(Array.from(host.querySelectorAll('label')).map(label => label.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Eligible department member'), expect.stringContaining('Audit reason'), expect.stringContaining('Confirmation')]))
    const submit = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes('Add pilot member'))!
    expect(submit.disabled).toBe(true); select.value = 'member-a'; select.dispatchEvent(new Event('change', { bubbles: true })); input(host, 'Audit reason', 'Assign for controlled pilot validation.'); check(host, 'I confirm this pilot membership assignment.'); await flush(); expect(submit.disabled).toBe(false); click(host, 'Add pilot member'); await flush()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/ai/governance/releases/release-a/pilots', expect.objectContaining({ method: 'POST', body: { kind: 'pack', memberUserId: 'member-a', reason: 'Assign for controlled pilot validation.' } }))
    app.unmount(); host.remove()
  })
})
