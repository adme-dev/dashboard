// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref } from 'vue'
import AiProposedActionCard from '~~/app/components/ai/AiProposedActionCard.vue'

const fetcher = vi.fn()
const toastAdd = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  UIcon: { template: '<i />' },
  UBadge: { template: '<span><slot /></span>' },
  UAlert: { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}</aside>' },
  UFormField: { props: ['label'], template: '<fieldset><legend>{{ label }}</legend><slot /></fieldset>' },
  UCheckbox: { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>' },
  UButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' }
}
async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
function mount(toolName: string, riskTier = 'confirm') {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(AiProposedActionCard, {
    conversationId: 'conversation',
    proposal: { proposalId: 'proposal', toolName, resolved: {
      version: 1, nativeMarketing: true, operation: 'marketing_update_campaign',
      args: { clientId: 'client-1', campaignId: 'campaign-7', dailyBudget: 150, enabled: false, note: '<review exact content>' },
      riskTier, actorId: 'internal-actor', digest: 'private-digest', executionKey: 'private-execution-key'
    } }
  }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  return host
}
function confirmButton(host: HTMLElement) {
  return Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Confirm operation')
}
beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useToast', () => ({ add: toastAdd }))
  toastAdd.mockClear()
  vi.stubGlobal('$fetch', fetcher)
  fetcher.mockReset().mockResolvedValue({ ok: true, resultRef: 'operation-result' })
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('native marketing confirmation card', () => {
  it.each(['marketing_update_campaign', 'native_marketing_operation'])('shows the exact operation and full arguments for %s', (toolName) => {
    const host = mount(toolName)
    expect(host.textContent).toContain('marketing_update_campaign')
    expect(host.querySelector('pre')?.textContent).toBe(JSON.stringify({
      clientId: 'client-1', campaignId: 'campaign-7', dailyBudget: 150, enabled: false, note: '<review exact content>'
    }, null, 2))
    expect(host.textContent).not.toContain('internal-actor')
    expect(host.textContent).not.toContain('private-digest')
    expect(host.textContent).not.toContain('private-execution-key')
    expect(host.textContent).not.toContain('Create task')
    expect(host.querySelector('review')).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('confirms only the saved proposal id after a user click', async () => {
    const host = mount('native_marketing_operation')
    expect(confirmButton(host)).toBeDefined()
    confirmButton(host)!.click()
    await flush()
    expect(fetcher).toHaveBeenCalledWith('/api/agency/ai/chat/conversations/conversation/confirm-action', {
      method: 'POST', body: { proposalId: 'proposal' }
    })
  })

  it('acknowledges a bounded server result without claiming completion', async () => {
    fetcher.mockResolvedValueOnce({ ok: true, resultRef: 'accepted-operation', summary: 'Prepared for peer review.' })
    const host = mount('native_marketing_operation')
    confirmButton(host)!.click()
    await flush()
    expect(toastAdd).toHaveBeenCalledWith({ title: 'Marketing result received', color: 'success' })
    expect(host.textContent).toContain('Marketing result received')
    expect(host.textContent).not.toContain('Marketing operation completed')
  })

  it.each(['marketing_update_campaign', 'native_marketing_rich_operation'])('requires a separate human acknowledgement for rich operation %s', async (toolName) => {
    const host = mount(toolName, 'rich_confirm')
    expect(confirmButton(host)).toBeDefined()
    expect(confirmButton(host)?.disabled).toBe(true)
    confirmButton(host)!.click()
    expect(fetcher).not.toHaveBeenCalled()
    const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    checkbox.click()
    await flush()
    expect(confirmButton(host)?.disabled).toBe(false)
    confirmButton(host)!.click()
    await flush()
    expect(fetcher).toHaveBeenCalledWith('/api/agency/ai/chat/conversations/conversation/confirm-action', {
      method: 'POST', body: { proposalId: 'proposal', richConfirmAck: true }
    })
  })
})
