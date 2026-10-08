// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import Editor from '../../app/components/page-studio/EmailTemplateEditor.client.vue'
import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'

vi.mock('../../app/components/page-studio/EmailTemplateAi.client.vue', () => ({ default: {
  emits: ['dirty', 'busy', 'apply'], setup(_props, { emit }) {
    return () => h('div', [h('button', { onClick: () => {
      emit('dirty', true)
      emit('busy', true)
    } }, 'Start fixture proposal'),
    h('button', { onClick: () => {
      emit('busy', false)
      emit('apply', { ...starterEmailTemplate('team'), subject: 'AI subject' })
      emit('dirty', false)
    } }, 'Apply fixture proposal')])
  }
} }))
vi.mock('../../app/components/page-studio/EmailTemplateHistory.client.vue', () => ({ default: { render: () => null } }))
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
function mount() {
  const data = ref({ activation: 'draft_only', canEdit: true, record: null }), refresh = vi.fn(), reload = vi.fn()
  const leave = vi.fn(), globalDirty = ref(false)
  for (const [name, value] of Object.entries({ computed, ref, watch, reactive, onBeforeUnmount, onBeforeRouteLeave: leave,
    useState: () => globalDirty, useFetch: () => ({ data, pending: ref(false), error: ref(null), refresh }),
    useEmailTemplatePreview: () => ({ preview: ref(null), status: ref('idle'), error: ref(''), refresh: vi.fn() }) })) vi.stubGlobal(name, value)
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(Editor, { siteId: '30000000-0000-4000-8000-000000000001', assets: [], checkpointId: 'checkpoint', audience: 'team', forms: [{ key: 'enquiry', name: 'Enquiry', pageId: 'contact', formId: 'enquiry' }], reloadWorkspace: reload }) })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>' })
  app.component('UInput', { props: ['modelValue'], template: '<input :value="modelValue">' })
  app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot /></label>' })
  for (const name of ['UAlert', 'UBadge', 'UIcon', 'USelect', 'USkeleton', 'UTabs', 'UTextarea', 'PageStudioEmailImageFields', 'PageStudioEmailMediaPicker']) app.component(name, { template: '<div><slot /></div>' })
  app.component('UAccordion', { render: () => null })
  app.component('UModal', { props: ['open'], template: '<div v-if="open"><slot name="footer" /></div>' })
  app.mount(host)
  const button = (label: string) => {
    const found = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label || item.getAttribute('aria-label') === label)
    if (!found) throw new Error(`Missing button ${label}`)
    return found
  }
  return { button, reload, refresh, leave, globalDirty }
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.unstubAllGlobals()
})
it('blocks reload and navigation while a proposal is in flight, then preserves Apply in Undo history', async () => {
  const s = mount()
  await nextTick()
  s.button('Start fixture proposal').click()
  await nextTick()
  expect(s.globalDirty.value).toBe(true)
  expect(s.button('Discard edits and reload').disabled).toBe(true)
  s.button('Discard edits and reload').click()
  expect(s.reload).not.toHaveBeenCalled()
  expect(await s.leave.mock.calls[0]![0]()).toBe(false)
  s.button('Apply fixture proposal').click()
  await nextTick()
  expect(host.querySelector('input')?.value).toBe('AI subject')
  expect(s.button('Save template draft').disabled).toBe(false)
  s.button('Undo').click()
  await nextTick()
  expect(host.querySelector('input')?.value).toBe(starterEmailTemplate('team').subject)
  expect(s.globalDirty.value).toBe(false)
})
