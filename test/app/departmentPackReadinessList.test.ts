// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h, ref } from 'vue'
import DepartmentPackReadinessList from '~~/app/components/ai/DepartmentPackReadinessList.vue'
import type { AiDepartmentReadinessItem } from '~~/app/types/aiGovernance'

const item: AiDepartmentReadinessItem = {
  key: 'marketing',
  packKey: 'department_marketing',
  name: 'Marketing',
  description: 'Marketing assistant pack.',
  status: 'missing_owner',
  releaseState: 'not_seeded',
  blockers: ['Nominate an eligible owner.'],
  department: { id: '10000000-0000-4000-8000-000000000001', name: 'Marketing', slug: 'marketing' },
  departmentMatches: [],
  ownerCandidate: null,
  ownerCandidates: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Morgan Member',
      source: 'department_member',
      membershipRole: 'lead',
      isManager: false,
      eligible: true
    },
    {
      id: '20000000-0000-4000-8000-000000000002',
      name: 'Taylor Assigned',
      source: 'primary_department_assignment',
      membershipRole: null,
      isManager: false,
      eligible: false
    }
  ],
  coverage: { capabilities: 3, tools: 4, evaluationCases: 3 },
  knownGaps: []
}

const stubs = {
  UCard: { template: '<article><slot /></article>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UButton: {
    emits: ['click'],
    template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}

describe('DepartmentPackReadinessList', () => {
  it('emits only an explicitly selected eligible member and explains ineligible assignments', async () => {
    const selected = ref<{ item: AiDepartmentReadinessItem, ownerId: string } | null>(null)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(DepartmentPackReadinessList, {
        items: [item],
        onSeed: (selectedItem: AiDepartmentReadinessItem, candidate: { id: string }) => {
          selected.value = { item: selectedItem, ownerId: candidate.id }
        }
      })
    })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)

    expect(host.textContent).toContain('Morgan Member')
    expect(host.textContent).toContain('Taylor Assigned')
    expect(host.textContent).toContain('Membership required')
    expect(host.querySelectorAll('[data-testid^="choose-owner-"]')).toHaveLength(1)

    host.querySelector<HTMLButtonElement>('[data-testid="choose-owner-marketing-20000000-0000-4000-8000-000000000001"]')!.click()
    expect(selected.value).toEqual({ item, ownerId: '20000000-0000-4000-8000-000000000001' })

    app.unmount()
    host.remove()
  })
})
