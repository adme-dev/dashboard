// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import Fields from '../../app/components/page-studio/EmailTemplateFields.client.vue'
import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'

let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement
function mount() {
  const state = reactive({ template: starterEmailTemplate('customer'), options: { available: true, siteId: 'site', apiAudience: 'portal', checkpointId: 'checkpoint', formKey: 'booking', fields: [{ fieldId: 'name', label: 'First name', type: 'text' }] }, formKey: 'booking', checkpointId: 'checkpoint', siteId: 'site', apiAudience: 'portal' as const, target: 'subject', disabled: false })
  const changes: unknown[] = []
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(Fields, { ...state, forms: [{ key: 'booking', name: 'Booking' }], onChange: (value) => {
    changes.push(structuredClone(value))
    state.template = value
  } }) })
  app.component('USelect', { props: ['items', 'modelValue', 'disabled'], emits: ['update:modelValue'], template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{item.label}}</option></select>' })
  app.component('UInput', { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)">' })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{label}}</button>' })
  app.component('UFormField', { props: ['label'], template: '<label>{{label}}<slot/></label>' })
  app.component('UAlert', { props: ['description'], template: '<p role="alert">{{description}}</p>' })
  app.mount(host)
  const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text)!
  const choose = async () => {
    const select = host.querySelector('select')!
    select.value = 'name'
    select.dispatchEvent(new Event('change'))
    await nextTick()
  }
  const fill = async (value: string, index = 0) => {
    const input = host.querySelectorAll('input')[index]
    input.value = value
    input.dispatchEvent(new Event('input'))
    await nextTick()
  }
  return { state, changes, button, choose, fill }
}
afterEach(() => {
  app?.unmount()
  host?.remove()
})
describe('manual field picker', () => {
  it('emits one complete unsaved edit only after Insert, preserving typed fallback across a response refresh', async () => {
    const s = mount()
    await s.choose()
    await s.fill('there')
    s.state.options = { ...s.state.options }
    await nextTick()
    expect(host.querySelector('input')?.value).toBe('there')
    expect(s.changes).toHaveLength(0)
    s.button('Insert field').click()
    await nextTick()
    expect(s.changes).toHaveLength(1)
    expect(s.state.template.subject).toContain('{{field.booking.name}}')
    expect(s.state.template.fieldBindings?.[0].fallback).toBe('there')
    s.button('Use fallback text').click()
    await nextTick()
    expect(s.state.template.schemaVersion).toBe(1)
    expect(s.state.template.subject).toContain('there')
  })
  it('uses the latest binding fallback after edit or Undo while preserving an intentional insertion buffer', async () => {
    const s = mount()
    await s.choose()
    await s.fill('there')
    s.button('Insert field').click()
    await nextTick()
    await s.fill('friend', 1)
    s.state.target = 'preheader'
    await nextTick()
    s.button('Insert field').click()
    await nextTick()
    expect(s.state.template.fieldBindings?.[0].fallback).toBe('friend')
    s.state.template = { ...s.state.template, fieldBindings: [{ ...s.state.template.fieldBindings![0], fallback: 'there' }] }
    await nextTick()
    s.button('Insert field').click()
    await nextTick()
    expect(s.state.template.fieldBindings?.[0].fallback).toBe('there')
    await s.fill('deliberate')
    s.state.template = { ...s.state.template, fieldBindings: [{ ...s.state.template.fieldBindings![0], fallback: 'restored' }] }
    await nextTick()
    expect(host.querySelector('input')?.value).toBe('deliberate')
    s.button('Insert field').click()
    await nextTick()
    expect(s.state.template.fieldBindings?.[0].fallback).toBe('deliberate')
  })
  it('withholds insertion after a stale checkpoint or form response and guards detached controls', async () => {
    const s = mount()
    await s.choose()
    const detached = s.button('Insert field')
    s.state.options.checkpointId = 'stale'
    await nextTick()
    expect(host.querySelector('select')).toBeNull()
    detached.click()
    await nextTick()
    expect(s.changes).toHaveLength(0)
  })
  it('respects read-only/busy state and rejects target length overflow without partial binding edits', async () => {
    const s = mount()
    await s.choose()
    s.state.disabled = true
    await nextTick()
    s.button('Insert field').click()
    expect(s.changes).toHaveLength(0)
    s.state.disabled = false
    s.state.template.subject = 'x'.repeat(200)
    await nextTick()
    s.button('Insert field').click()
    await nextTick()
    expect(s.changes).toHaveLength(0)
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
  })
})
