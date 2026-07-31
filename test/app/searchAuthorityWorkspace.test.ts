// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'
import OpportunityTable from '~~/app/components/search-authority/OpportunityTable.vue'
import TaskCreateDialog from '~~/app/components/workflow/TaskCreateDialog.vue'
import type { SearchAuthorityOpportunity } from '~~/app/types'

const toastAdd = vi.fn()

Object.assign(globalThis, {
  computed,
  ref,
  watch,
  useToast: () => ({ add: toastAdd })
})

const stubs = {
  UModal: {
    template: '<section><slot name="content" /></section>'
  },
  UCard: {
    template: '<article><slot name="header" /><slot /><slot name="footer" /></article>'
  },
  UFormField: {
    props: ['label'],
    template: '<label><span>{{ label }}</span><slot name="label" /><slot /></label>'
  },
  UInput: {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  UTextarea: {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UButton: {
    inheritAttrs: false,
    props: ['disabled', 'loading', 'label', 'type'],
    emits: ['click'],
    template: '<button v-bind="$attrs" :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  },
  USelectMenu: {
    props: ['modelValue'],
    template: '<span />'
  },
  UPopover: {
    template: '<span><slot /><slot name="content" /></span>'
  },
  UCalendar: {
    template: '<span />'
  },
  UIcon: {
    template: '<i />'
  },
  WorkflowAssigneePicker: {
    template: '<span />'
  },
  UBadge: {
    props: ['label'],
    template: '<span>{{ label }}<slot /></span>'
  },
  UTable: {
    props: ['data'],
    setup(
      props: { data: SearchAuthorityOpportunity[] },
      { slots }: { slots: Record<string, (value: unknown) => unknown> }
    ) {
      return () => h('div', props.data.length
        ? props.data.flatMap(item => [
            slots['opportunity-cell']?.({ row: { original: item } }),
            slots['evidence-cell']?.({ row: { original: item } }),
            slots['status-cell']?.({ row: { original: item } }),
            slots['actions-cell']?.({ row: { original: item } })
          ])
        : [slots.empty?.({})])
    }
  }
}

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('Search Authority task handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps evidence-prefilled task text editable and emits the created task identity', async () => {
    const fetchMock = vi.fn(async () => ({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Review H6 search snippet'
    }))
    Object.assign(globalThis, { $fetch: fetchMock })
    const created: Array<{ id: string, title: string }> = []
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(TaskCreateDialog, {
        open: true,
        statuses: [],
        teamMembers: [],
        projects: [],
        labels: [],
        departmentId: 'marketing',
        initialTitle: 'Improve search click-through: haval h6 hybrid',
        initialDescription: 'Evidence: 1,000 impressions at 2% CTR.',
        onCreated: (task: { id: string, title: string }) => created.push(task)
      })
    })
    Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
    app.mount(host)

    try {
      await flushUi()
      expect(fetchMock).not.toHaveBeenCalled()

      const title = host.querySelector<HTMLInputElement>('[data-testid="task-create-title"]')!
      const description = host.querySelector<HTMLTextAreaElement>(
        '[data-testid="task-create-description"]'
      )!
      expect(title.value).toBe('Improve search click-through: haval h6 hybrid')
      expect(description.value).toContain('1,000 impressions')

      title.value = 'Review H6 search snippet'
      title.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
      host.querySelector<HTMLButtonElement>('[data-testid="task-create-submit"]')!.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('/api/agency/tasks', expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          title: 'Review H6 search snippet',
          description: 'Evidence: 1,000 impressions at 2% CTR.'
        })
      }))
      expect(created).toEqual([{
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Review H6 search snippet'
      }])
    } finally {
      app.unmount()
    }
  })

  it('requires and submits the client-owned project for governed task handoff', async () => {
    const fetchMock = vi.fn(async () => ({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Review H6 search snippet'
    }))
    Object.assign(globalThis, { $fetch: fetchMock })
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(TaskCreateDialog, {
        open: true,
        statuses: [],
        teamMembers: [],
        projects: [{
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Knox Search Authority'
        }],
        labels: [],
        departmentId: 'marketing',
        initialTitle: 'Review H6 search snippet',
        initialProjectId: '44444444-4444-4444-8444-444444444444',
        projectRequired: true
      })
    })
    Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
    app.mount(host)

    try {
      await flushUi()
      host.querySelector<HTMLButtonElement>('[data-testid="task-create-submit"]')!.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agency/tasks',
        expect.objectContaining({
          body: expect.objectContaining({
            projectId: '44444444-4444-4444-8444-444444444444'
          })
        })
      )
    } finally {
      app.unmount()
    }
  })

  it('keeps review and task creation behind explicit opportunity actions', async () => {
    const reviewed: string[] = []
    const taskRequests: string[] = []
    const opportunity = (
      id: string,
      lifecycleStatus: SearchAuthorityOpportunity['lifecycleStatus']
    ): SearchAuthorityOpportunity => ({
      id,
      opportunityType: 'low_ctr',
      queryText: 'haval h6 hybrid',
      pageUrl: 'https://example.com/h6',
      title: 'Improve H6 search click-through',
      summary: 'CTR is below the position-band baseline.',
      score: 72,
      confidence: 0.75,
      scoringVersion: 'gsc-v1',
      reasonCodes: [{
        code: 'ctr_below_position_baseline',
        observed: 0.02,
        expected: 0.04,
        contribution: 42
      }],
      lifecycleStatus,
      evidenceStartDate: '2026-07-04',
      evidenceEndDate: '2026-07-31',
      taskId: null,
      provider: {
        dataThroughDate: '2026-07-31',
        provisionalFromDate: '2026-07-29',
        provisional: true
      }
    })
    const host = document.createElement('div')
    const app = createApp({
      render: () => h(OpportunityTable, {
        opportunities: [
          opportunity('new-opportunity', 'new'),
          opportunity('accepted-opportunity', 'accepted')
        ],
        loading: false,
        onTransition: (item: SearchAuthorityOpportunity) => reviewed.push(item.id),
        onCreateTask: (item: SearchAuthorityOpportunity) => taskRequests.push(item.id)
      })
    })
    Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
    app.mount(host)

    try {
      await flushUi()
      expect(host.textContent).toContain('Score 72')
      expect(host.textContent).toContain('75% confidence')
      expect(host.textContent).toContain('Provider provisional')
      const buttons = [...host.querySelectorAll('button')]
      buttons.find(button => button.textContent?.includes('Review'))?.click()
      buttons.find(button => button.textContent?.includes('Create task'))?.click()
      await nextTick()

      expect(reviewed).toEqual(['new-opportunity'])
      expect(taskRequests).toEqual(['accepted-opportunity'])
    } finally {
      app.unmount()
    }
  })
})
