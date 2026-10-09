// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, computed, watch } from 'vue'
import EmailTemplateAi from '../../app/components/page-studio/EmailTemplateAi.client.vue'
import { useEmailTemplateProposal } from '../../app/composables/useEmailTemplateProposal'
import { useEmailTemplatePreview } from '../../app/composables/useEmailTemplatePreview'
import { captureEmailTemplateDraft, EmailTemplateAiOptionsSchema } from '../../shared/pageStudio/emailTemplateProposals'
import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'

const apps: ReturnType<typeof createApp>[] = []
const available = () => ({ available: true, reason: null, models: [{ id: 'groq/model', label: 'Text model' }], allowance: { period: '2026-10-01', used: '0', limit: 10, remaining: 10 } })
function mount(native = false) {
  const options = ref(EmailTemplateAiOptionsSchema.parse(available()))
  const refresh = vi.fn()
  const state = reactive({ url: '/template', websiteUrl: '/template', native, canEdit: true, draft: { siteId: '30000000-0000-4000-8000-000000000001', apiAudience: 'portal' as const, audience: 'team' as const, pageId: 'contact', formId: 'enquiry', checkpointId: 'checkpoint', expectedRevision: 0, customised: false, template: starterEmailTemplate('team') } })
  const fetch = vi.fn(async (url, config) => {
    if (url.endsWith('/preview')) return { html: '<p>Safe preview</p>', subject: 'Improved', preheader: '', warnings: [] }
    return { schemaVersion: 1, id: crypto.randomUUID(), operationId: config.body.operationId, modelId: config.body.modelId,
      baseDigest: (await captureEmailTemplateDraft(state.draft)).digest, summary: 'Improved subject', warnings: [], template: { ...config.body.template, subject: 'Improved' } }
  })
  for (const [name, value] of Object.entries({ ref, computed, watch, useEmailTemplateProposal, useEmailTemplatePreview, $fetch: fetch,
    useFetch: () => ({ data: options, status: ref('success'), error: ref(null), refresh }) })) vi.stubGlobal(name, value)
  const apply = vi.fn(), dirty = vi.fn()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(EmailTemplateAi, { ...state, onApply: apply, onDirty: dirty }) })
  apps.push(app)
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}<slot name="actions" /></div>' })
  app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot /></label>' })
  app.component('UTextarea', { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('USelect', { props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.id">{{ item.label }}</option></select>' })
  app.mount(host)
  const button = (label: string) => {
    const found = [...host.querySelectorAll('button')].find(item => item.textContent === label)
    if (!found) throw new Error(`Missing button ${label}`)
    return found
  }
  return { host, options, refresh, fetch, apply, dirty, button, state }
}
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
async function fill(s: ReturnType<typeof mount>) {
  s.button('AI design').click()
  await nextTick()
  const textarea = s.host.querySelector('textarea')!
  textarea.value = 'Improve this'
  textarea.dispatchEvent(new Event('input'))
  await nextTick()
}
describe('email AI panel', () => {
  it('renders a preview before Apply, keeps the current draft intact and reports dirty state', async () => {
    const s = mount()
    await fill(s)
    expect(s.dirty).toHaveBeenLastCalledWith(true)
    s.button('Generate proposal').click()
    await vi.waitFor(() => expect(s.host.textContent).toContain('Improved subject'))
    expect(s.button('Apply to draft').disabled).toBe(true)
    await vi.waitFor(() => expect(s.button('Apply to draft').disabled).toBe(false))
    expect(s.host.querySelector('iframe')?.getAttribute('sandbox')).toBe('')
    expect(s.fetch.mock.calls.every(call => call[1].retry === 0)).toBe(true)
    expect(s.apply).not.toHaveBeenCalled()
    s.button('Apply to draft').click()
    await nextTick()
    expect(s.apply).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Improved' }))
    expect(s.dirty).toHaveBeenLastCalledWith(false)
  })
  it('disables generation when exhausted and never requests models for native preview', async () => {
    const s = mount()
    s.options.value = EmailTemplateAiOptionsSchema.parse({ ...available(), allowance: { period: '2026-10-01', used: '10', limit: 10, remaining: 0 } })
    await fill(s)
    expect(s.button('Generate proposal').disabled).toBe(true)
    expect(s.fetch).not.toHaveBeenCalled()
    const t = mount(true)
    t.button('AI design').click()
    await nextTick()
    expect(t.host.textContent).toContain('not available in this preview')
    expect(t.refresh).not.toHaveBeenCalled()
  })
})
