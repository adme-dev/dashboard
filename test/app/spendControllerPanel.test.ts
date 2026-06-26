// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref } from 'vue'
import SpendControllerPanel from '~~/app/components/social/SpendControllerPanel.vue'

Object.assign(globalThis, {
  computed,
  ref,
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
    render: () => h(SpendControllerPanel, { month: 6, year: 2026, platform: 'meta' }),
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host }
}

describe('SpendControllerPanel', () => {
  it('asks the read-only spend controller and renders findings without execute controls', async () => {
    const fetchMock = vi.fn(async () => ({
      runId: 'run-1',
      mode: 'read_only',
      answer: 'I found 1 critical spend pacing issue.',
      findings: [{
        severity: 'critical',
        title: 'Acme / Lead Gen is overpacing',
        detail: 'Projected over budget.',
        sourceRefs: [{ type: 'media_spend', id: 'spend-1', label: 'Lead Gen' }],
      }],
      recommendedActions: ['Review critical and warning pacing issues before changing budgets.'],
      proposedActions: [],
      audit: {
        modelFeatureKey: 'agent_spend_controller',
        toolCallCount: 1,
        blockedActionCount: 0,
        runLoggingAvailable: true,
      },
    }))
    const { app, host } = mountPanel(fetchMock)

    host.querySelector<HTMLButtonElement>('[data-testid="ask-spend-controller"]')?.click()
    await flushUi()

    expect(fetchMock).toHaveBeenCalledWith('/api/agency/agents/spend-controller/ask', {
      method: 'POST',
      body: {
        prompt: 'What spend issues need attention today?',
        context: {
          period: '2026-06',
          platform: 'meta',
        },
      },
    })
    expect(host.textContent).toContain('I found 1 critical spend pacing issue.')
    expect(host.textContent).toContain('Acme / Lead Gen is overpacing')
    expect(host.textContent).toContain('0 direct writes')
    expect(host.textContent).not.toContain('Execute')

    app.unmount()
    host.remove()
  })

  it('drafts action plans explicitly after a read-only review', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        runId: 'run-1',
        mode: 'read_only',
        answer: 'I found 1 critical spend pacing issue.',
        findings: [{
          severity: 'critical',
          title: 'Acme / Lead Gen is overpacing',
          detail: 'Projected over budget.',
          sourceRefs: [{ type: 'media_spend', id: 'spend-1', label: 'Lead Gen' }],
        }],
        recommendedActions: ['Review critical and warning pacing issues before changing budgets.'],
        proposedActions: [],
        audit: { modelFeatureKey: 'agent_spend_controller', toolCallCount: 1, blockedActionCount: 0 },
      })
      .mockResolvedValueOnce({
        runId: 'run-2',
        mode: 'read_propose',
        answer: 'Any drafted action remains planned and still requires approval before execution.',
        findings: [{
          severity: 'critical',
          title: 'Acme / Lead Gen is overpacing',
          detail: 'Projected over budget.',
          sourceRefs: [{ type: 'media_spend', id: 'spend-1', label: 'Lead Gen' }],
        }],
        recommendedActions: ['Use the existing action-plan approval flow for any budget change.'],
        proposedActions: [{
          type: 'campaign_action_plan',
          label: 'Lead Gen: draft daily budget 0',
          status: 'requires_confirmation',
          payloadRef: 'action-1',
          rationale: ['Drafted as a planned action only.'],
        }],
        audit: { modelFeatureKey: 'agent_spend_controller', toolCallCount: 1, blockedActionCount: 0 },
      })
    const { app, host } = mountPanel(fetchMock)

    host.querySelector<HTMLButtonElement>('[data-testid="ask-spend-controller"]')?.click()
    await flushUi()
    host.querySelector<HTMLButtonElement>('[data-testid="draft-spend-controller-actions"]')?.click()
    await flushUi()

    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/agency/agents/spend-controller/ask',
      {
        method: 'POST',
        body: {
          prompt: 'What spend issues need attention today?',
          draftActions: true,
          context: {
            period: '2026-06',
            platform: 'meta',
          },
        },
      },
    ])
    expect(host.textContent).toContain('Lead Gen: draft daily budget 0')
    expect(host.textContent).toContain('Requires approval')

    app.unmount()
    host.remove()
  })

  it('shows a dormant message when the endpoint is disabled', async () => {
    const fetchMock = vi.fn(async () => {
      const error = new Error('disabled') as Error & { statusCode?: number }
      error.statusCode = 404
      throw error
    })
    const { app, host } = mountPanel(fetchMock)

    host.querySelector<HTMLButtonElement>('[data-testid="ask-spend-controller"]')?.click()
    await flushUi()

    expect(host.textContent).toContain('Spend Controller is not enabled in this environment.')

    app.unmount()
    host.remove()
  })
})
