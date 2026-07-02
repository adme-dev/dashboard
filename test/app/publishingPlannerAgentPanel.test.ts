// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'
import PlannerAgentPanel from '~~/app/components/social-publishing/PlannerAgentPanel.vue'

Object.assign(globalThis, {
  computed,
  ref,
  watch,
})

const stubs = {
  UAlert: {
    props: ['title', 'description'],
    template: '<section data-alert><strong>{{ title }}</strong><p>{{ description }}</p></section>',
  },
  UBadge: {
    props: ['color', 'variant', 'size'],
    template: '<span data-badge><slot /></span>',
  },
  UButton: {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button v-bind="$attrs" type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />',
  },
  USelectMenu: {
    props: ['modelValue', 'items', 'disabled'],
    emits: ['update:modelValue'],
    template: '<select v-bind="$attrs" :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
  },
  UTextarea: {
    props: ['modelValue', 'disabled', 'rows'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :rows="rows" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}

async function flushUi() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountPanel(fetchMock: ReturnType<typeof vi.fn>) {
  ;(globalThis as any).$fetch = fetchMock
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(PlannerAgentPanel, { clientId: 'client-1' }),
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host }
}

describe('PlannerAgentPanel', () => {
  it('asks the read-only Publishing Planner Agent and renders planner health', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/agency/social/publishing/campaigns') return []
      return {
      runId: 'run-1',
      mode: 'read_only',
      answer: 'Publishing planner review found 2 approved/scheduled posts, 3 drafts, 0 queued items, and 1 enabled slot.',
      summary: {
        clientId: 'client-1',
        postsByStatus: { draft: 3, scheduled: 2 },
        campaignsByStatus: { active: 1 },
        connectedPlatforms: { facebook: 1 },
        queueCount: 0,
        totalSlots: 2,
        enabledSlots: 1,
        activeAccounts: 1,
        erroredAccounts: 0,
        nextScheduled: [],
      },
      findings: [{
        severity: 'info',
        title: 'Drafts are not in the queue',
        detail: '3 drafts can be queued or assigned to slots.',
      }],
      recommendedActions: ['Move ready drafts into the queue or assign scheduled dates.'],
      proposedActions: [],
      audit: {
        modelFeatureKey: 'agent_publishing_planner',
        toolCallCount: 7,
        blockedActionCount: 0,
        runLoggingAvailable: true,
      },
      }
    })
    const { app, host } = mountPanel(fetchMock)

    host.querySelector<HTMLButtonElement>('[data-testid="ask-publishing-planner-agent"]')?.click()
    await flushUi()

    expect(fetchMock).toHaveBeenCalledWith('/api/agency/agents/publishing-planner/ask', {
      method: 'POST',
      body: {
        prompt: 'Review this client publishing planner and tell me what needs attention.',
        context: {
          clientId: 'client-1',
        },
      },
    })
    expect(host.textContent).toContain('Publishing planner review found 2 approved/scheduled posts')
    expect(host.textContent).toContain('Drafts are not in the queue')
    expect(host.textContent).toContain('0 direct writes')
    expect(host.querySelector('button[data-testid="publish-planner-recommendation"]')).toBeNull()
    expect(host.textContent).not.toContain('Execute')

    app.unmount()
    host.remove()
  })

  it('shows a dormant message when the endpoint is disabled', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/agency/social/publishing/campaigns') return []
      const error = new Error('disabled') as Error & { statusCode?: number }
      error.statusCode = 404
      throw error
    })
    const { app, host } = mountPanel(fetchMock)

    host.querySelector<HTMLButtonElement>('[data-testid="ask-publishing-planner-agent"]')?.click()
    await flushUi()

    expect(host.textContent).toContain('Publishing Planner Agent is not enabled in this environment.')

    app.unmount()
    host.remove()
  })

  it('generates editable draft suggestions and accepts them as drafts only', async () => {
    const fetchMock = vi.fn(async (url: string, options: any) => {
      if (url === '/api/agency/social/publishing/campaigns') {
        return [{ id: 'campaign-1', name: 'Launch campaign' }]
      }
      if (url === '/api/agency/agents/publishing-planner/ask' && options?.body?.context?.draftPlan) {
        return {
          runId: 'run-2',
          mode: 'draft_only',
          answer: 'Publishing planner generated 2 editable draft suggestions and did not create, schedule, or publish any post.',
          summary: {
            clientId: 'client-1',
            postsByStatus: { draft: 1 },
            campaignsByStatus: {},
            connectedPlatforms: { facebook: 1 },
            queueCount: 0,
            totalSlots: 1,
            enabledSlots: 1,
            activeAccounts: 1,
            erroredAccounts: 0,
            nextScheduled: [],
          },
          findings: [],
          recommendedActions: ['Review the draft suggestions before adding them.'],
          drafts: [
            {
              content: 'Draft one',
              platforms: ['facebook'],
              platform_overrides: {},
              hashtags: ['one'],
              suggested_scheduled_at: null,
            },
            {
              content: 'Draft two',
              platforms: ['instagram'],
              platform_overrides: { instagram: { content: 'Instagram draft two' } },
              hashtags: ['two'],
              suggested_scheduled_at: '2026-07-01T01:00:00.000Z',
            },
          ],
          proposedActions: [],
          audit: {
            modelFeatureKey: 'agent_publishing_planner',
            toolCallCount: 8,
            blockedActionCount: 0,
            runLoggingAvailable: true,
          },
        }
      }
      if (url === '/api/agency/social/publishing/posts') {
        return { id: 'post-1', status: 'draft' }
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    const { app, host } = mountPanel(fetchMock)
    await flushUi()
    const select = host.querySelector<HTMLSelectElement>('select')
    expect(select).toBeTruthy()
    select!.value = 'campaign-1'
    select!.dispatchEvent(new Event('change'))
    await flushUi()

    host.querySelector<HTMLButtonElement>('[data-testid="generate-publishing-planner-drafts"]')?.click()
    await flushUi()

    expect(fetchMock).toHaveBeenCalledWith('/api/agency/agents/publishing-planner/ask', {
      method: 'POST',
      body: {
        prompt: 'Review this client publishing planner and tell me what needs attention.',
        context: {
          clientId: 'client-1',
          campaignId: 'campaign-1',
          draftPlan: true,
          brief: 'Review this client publishing planner and tell me what needs attention.',
          count: 5,
          platforms: ['facebook', 'instagram'],
        },
      },
    })
    expect(host.textContent).toContain('Editable draft suggestions')
    expect(Array.from(host.querySelectorAll<HTMLTextAreaElement>('textarea')).some(input => input.value === 'Draft one')).toBe(true)
    expect(Array.from(host.querySelectorAll<HTMLTextAreaElement>('textarea')).some(input => input.value === 'Draft two')).toBe(true)
    host.querySelector<HTMLButtonElement>('[data-testid="discard-publishing-planner-draft"]')?.click()
    await flushUi()
    expect(Array.from(host.querySelectorAll<HTMLTextAreaElement>('textarea')).some(input => input.value === 'Draft one')).toBe(false)

    const textarea = Array.from(host.querySelectorAll<HTMLTextAreaElement>('textarea')).find(input => input.value === 'Draft two')
    expect(textarea).toBeTruthy()
    textarea!.value = 'Edited draft two'
    textarea!.dispatchEvent(new Event('input'))
    await flushUi()
    host.querySelector<HTMLButtonElement>('[data-testid="accept-publishing-planner-drafts"]')?.click()
    await flushUi()

    expect(fetchMock).toHaveBeenCalledWith('/api/agency/social/publishing/posts', {
      method: 'POST',
      body: {
        clientId: 'client-1',
        campaignId: 'campaign-1',
        content: 'Edited draft two',
        platforms: ['instagram'],
        platformOverrides: { instagram: { content: 'Instagram draft two' } },
        hashtags: ['two'],
        scheduledAt: '2026-07-01T01:00:00.000Z',
        metadata: {
          source: 'publishing_planner_agent',
          agentRunId: 'run-2',
        },
      },
    })

    app.unmount()
    host.remove()
  })
})
