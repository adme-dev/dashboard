// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'
import DepartmentDraftSeedDialog from '~~/app/components/ai/DepartmentDraftSeedDialog.vue'
import type { AiDepartmentReadinessItem } from '~~/app/types/aiGovernance'

Object.assign(globalThis, { computed, ref, watch })

const stubs = {
  UModal: {
    props: ['open', 'title', 'description'],
    emits: ['update:open'],
    template: '<section v-if="open" role="dialog"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /></section>'
  },
  UAlert: { props: ['title', 'description'], template: '<aside><strong>{{ title }}</strong><span>{{ description }}</span><slot /></aside>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UInput: {
    props: ['modelValue', 'disabled', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :value="modelValue" :disabled="disabled" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UTextarea: {
    props: ['modelValue', 'disabled', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :value="modelValue" :disabled="disabled" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UButton: {
    props: ['disabled', 'loading', 'type'],
    emits: ['click'],
    template: '<button v-bind="$attrs" :type="type || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}

const item: AiDepartmentReadinessItem = {
  key: 'creative',
  packKey: 'department_creative',
  name: 'Creative',
  description: 'Creative assistant pack.',
  status: 'ready_for_owner_confirmation',
  releaseState: 'not_seeded',
  blockers: ['Confirm the named owner before seeding the draft.'],
  department: { id: '10000000-0000-4000-8000-000000000001', name: 'Creative', slug: 'creative' },
  departmentMatches: [],
  ownerCandidate: { id: '20000000-0000-4000-8000-000000000001', name: 'Casey Owner', source: 'department_manager' },
  ownerCandidates: [],
  coverage: { capabilities: 3, tools: 4, evaluationCases: 3 },
  knownGaps: []
}

async function flushUi() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function mountDialog(onSeed = vi.fn(async () => ({ outcome: 'created' as const, releaseState: 'draft' as const }))) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(DepartmentDraftSeedDialog, { open: true, item, onSeed })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host, onSeed }
}

describe('DepartmentDraftSeedDialog', () => {
  it('accepts an explicitly selected active department member for a missing-manager pack', async () => {
    const selectedMemberItem: AiDepartmentReadinessItem = {
      ...item,
      status: 'missing_owner',
      ownerCandidate: {
        id: '20000000-0000-4000-8000-000000000002',
        name: 'Morgan Member',
        source: 'department_member'
      }
    }
    const onSeed = vi.fn(async () => ({ outcome: 'created' as const, releaseState: 'draft' as const }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(DepartmentDraftSeedDialog, { open: true, item: selectedMemberItem, onSeed })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)

    input(host.querySelector<HTMLTextAreaElement>('[data-testid="seed-draft-reason"]')!, 'Explicitly approved active department member.')
    input(host.querySelector<HTMLInputElement>('[data-testid="seed-draft-confirmation"]')!, 'SEED_DRAFT')
    await flushUi()

    expect(host.querySelector<HTMLButtonElement>('[data-testid="seed-draft-submit"]')?.disabled).toBe(false)
    host.querySelector<HTMLButtonElement>('[data-testid="seed-draft-submit"]')!.click()
    await flushUi()
    expect(onSeed).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: '20000000-0000-4000-8000-000000000002'
    }))

    app.unmount()
    host.remove()
  })

  it('requires a reason and the exact typed confirmation before enabling the write', async () => {
    const { app, host, onSeed } = mountDialog()
    const submit = host.querySelector<HTMLButtonElement>('[data-testid="seed-draft-submit"]')!

    expect(submit.disabled).toBe(true)
    input(host.querySelector<HTMLTextAreaElement>('[data-testid="seed-draft-reason"]')!, 'Approved owner for a bounded draft review.')
    input(host.querySelector<HTMLInputElement>('[data-testid="seed-draft-confirmation"]')!, 'seed_draft')
    await flushUi()
    expect(submit.disabled).toBe(true)

    input(host.querySelector<HTMLInputElement>('[data-testid="seed-draft-confirmation"]')!, 'SEED_DRAFT')
    await flushUi()
    expect(submit.disabled).toBe(false)
    expect(onSeed).not.toHaveBeenCalled()
    app.unmount()
    host.remove()
  })

  it('submits only the displayed blueprint, department, owner, and audit reason', async () => {
    const { app, host, onSeed } = mountDialog()
    input(host.querySelector<HTMLTextAreaElement>('[data-testid="seed-draft-reason"]')!, 'Approved owner for a bounded draft review.')
    input(host.querySelector<HTMLInputElement>('[data-testid="seed-draft-confirmation"]')!, 'SEED_DRAFT')
    await flushUi()
    host.querySelector<HTMLButtonElement>('[data-testid="seed-draft-submit"]')!.click()
    await flushUi()

    expect(onSeed).toHaveBeenCalledWith({
      blueprintKey: 'creative',
      departmentId: '10000000-0000-4000-8000-000000000001',
      ownerUserId: '20000000-0000-4000-8000-000000000001',
      reason: 'Approved owner for a bounded draft review.'
    })
    expect(host.textContent).toContain('Draft pack created')
    app.unmount()
    host.remove()
  })

  it('surfaces a generic API failure without losing the entered confirmation', async () => {
    const onSeed = vi.fn(async () => {
      throw { data: { statusMessage: 'Department draft pack could not be seeded' } }
    })
    const { app, host } = mountDialog(onSeed)
    input(host.querySelector<HTMLTextAreaElement>('[data-testid="seed-draft-reason"]')!, 'Approved owner for a bounded draft review.')
    input(host.querySelector<HTMLInputElement>('[data-testid="seed-draft-confirmation"]')!, 'SEED_DRAFT')
    await flushUi()
    host.querySelector<HTMLButtonElement>('[data-testid="seed-draft-submit"]')!.click()
    await flushUi()

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Department draft pack could not be seeded')
    expect(host.querySelector<HTMLInputElement>('[data-testid="seed-draft-confirmation"]')?.value).toBe('SEED_DRAFT')
    app.unmount()
    host.remove()
  })

  it('does not expose an unstructured internal error message', async () => {
    const onSeed = vi.fn(async () => {
      throw new Error('database connection detail')
    })
    const { app, host } = mountDialog(onSeed)
    input(host.querySelector<HTMLTextAreaElement>('[data-testid="seed-draft-reason"]')!, 'Approved owner for a bounded draft review.')
    input(host.querySelector<HTMLInputElement>('[data-testid="seed-draft-confirmation"]')!, 'SEED_DRAFT')
    await flushUi()
    host.querySelector<HTMLButtonElement>('[data-testid="seed-draft-submit"]')!.click()
    await flushUi()

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('The draft pack could not be seeded.')
    expect(host.textContent).not.toContain('database connection detail')
    app.unmount()
    host.remove()
  })
})
