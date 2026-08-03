// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, watch } from 'vue'
import DepartmentDraftSeedDialog from '~~/app/components/ai/DepartmentDraftSeedDialog.vue'
import type { AiDepartmentReadinessItem } from '~~/app/types/aiGovernance'

Object.assign(globalThis, { computed, reactive, ref, watch })

const stubs = {
  UModal: { props: ['open'], template: '<section v-if="open" role="dialog"><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { props: ['label', 'help'], template: '<label><span>{{ label }}</span><slot /><small>{{ help }}</small></label>' },
  UAlert: { props: ['title', 'description'], template: '<aside><strong>{{ title }}</strong><span>{{ description }}</span><slot /></aside>' },
  UTextarea: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UButton: { props: ['disabled'], emits: ['click'], template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>' },
  UBadge: { template: '<span><slot /></span>' }, UIcon: { template: '<i />' }
}

const item: AiDepartmentReadinessItem = { key: 'marketing', packKey: 'pack-a', name: 'Marketing', description: 'Pack', status: 'ready_for_owner_confirmation', releaseState: 'not_seeded', blockers: [], department: { id: '10000000-0000-4000-8000-000000000001', name: 'Marketing', slug: 'marketing' }, departmentMatches: [], ownerCandidate: { id: '20000000-0000-4000-8000-000000000001', name: 'Owner', source: 'department_member' }, ownerCandidates: [], coverage: { capabilities: 1, tools: 1, evaluationCases: 1 }, knownGaps: [] }
async function flush() { for (let i = 0; i < 4; i += 1) { await Promise.resolve(); await nextTick() } }

describe('AI governance forms', () => {
  it('renders labelled Nuxt UI controls and keeps the write disabled until an audit reason and explicit confirmation exist', async () => {
    const onSeed = vi.fn(async () => ({ outcome: 'created' as const, releaseState: 'draft' as const })); const host = document.createElement('div'); document.body.appendChild(host)
    const app = createApp({ render: () => h(DepartmentDraftSeedDialog, { open: true, item, onSeed }) }); Object.entries(stubs).forEach(([name, component]) => app.component(name, component)); app.mount(host)
    const submit = host.querySelector('[data-testid="seed-draft-submit"]') as HTMLButtonElement
    expect(Array.from(host.querySelectorAll('label')).map(label => label.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Audit reason'), expect.stringContaining('Confirmation')]))
    expect(submit.disabled).toBe(true); expect(host.querySelectorAll('input, textarea')).toHaveLength(2)
    app.unmount(); host.remove(); await flush()
  })
})
