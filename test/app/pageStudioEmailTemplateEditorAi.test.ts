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
    useState: () => globalDirty, useFetch: (url: string) => ({ data: url.endsWith('/fields') ? ref({ available: true, siteId: '30000000-0000-4000-8000-000000000001', apiAudience: 'portal', checkpointId: 'checkpoint', formKey: 'enquiry', fields: [{ fieldId: 'name', label: 'First name', type: 'text' }] }) : data, pending: ref(false), error: ref(null), refresh }),
    useEmailTemplatePreview: () => ({ preview: ref(null), status: ref('idle'), error: ref(''), refresh: vi.fn() }) })) vi.stubGlobal(name, value)
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(Editor, { siteId: '30000000-0000-4000-8000-000000000001', assets: [], checkpointId: 'checkpoint', audience: 'team', forms: [{ key: 'enquiry', name: 'Enquiry', pageId: 'contact', formId: 'enquiry' }], reloadWorkspace: reload }) })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>' })
  app.component('UInput', { props: ['modelValue'], template: '<input :value="modelValue">' })
  app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot /></label>' })
  app.component('USelect', { props: ['items', 'modelValue', 'disabled'], emits: ['update:modelValue'], template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{item.label}}</option></select>' })
  for (const name of ['UAlert', 'UBadge', 'UIcon', 'USkeleton', 'UTabs', 'UTextarea', 'PageStudioEmailImageFields', 'PageStudioEmailMediaPicker']) app.component(name, { template: '<div><slot /></div>' })
  app.component('UAccordion', { template: '<div><slot name="variables" /></div>' })
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

it('records a complete manual field insertion and fallback conversion in the parent Undo and Redo history', async () => {
  const s = mount()
  await nextTick()
  const select = host.querySelector('[aria-label="Form field text"] select') as HTMLSelectElement
  select.value = 'name'
  select.dispatchEvent(new Event('change'))
  await nextTick()
  const initial = starterEmailTemplate('team').subject
  s.button('Insert field').click()
  await nextTick()
  expect(host.querySelector('input')?.value).toBe(`${initial}{{field.enquiry.name}}`)
  expect(s.globalDirty.value).toBe(true)
  s.button('Undo').click()
  await nextTick()
  expect(host.querySelector('input')?.value).toBe(initial)
  expect(s.globalDirty.value).toBe(false)
  expect(host.querySelector('[aria-label="Form field text"]')?.textContent).not.toContain('Use fallback text')
  s.button('Redo').click()
  await nextTick()
  expect(host.querySelector('input')?.value).toBe(`${initial}{{field.enquiry.name}}`)
  expect(host.querySelector('[aria-label="Form field text"]')?.textContent).toContain('Use fallback text')
  s.button('Use fallback text').click()
  await nextTick()
  expect(host.querySelector('input')?.value).toBe(initial)
  s.button('Undo').click()
  await nextTick()
  expect(host.querySelector('input')?.value).toBe(`${initial}{{field.enquiry.name}}`)
})
