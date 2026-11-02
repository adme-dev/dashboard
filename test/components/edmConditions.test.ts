// @vitest-environment happy-dom
import { computed, createApp, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Picker from '../../app/components/email/builder/EdmConditionPicker.vue'
import Editor from '../../app/components/email/builder/EdmConditionPredicateEditor.vue'
import { useEdmConditions } from '../../app/composables/useEdmConditions'

const client = '11111111-1111-4111-8111-111111111111'
const rule = { field: 'first_name', op: 'exists' }
const condition = { version: 1, name: 'Known name', predicate: rule }
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
function mount(canEdit: boolean, eligible = true) {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal(
    '$fetch',
    vi
      .fn()
      .mockImplementation(url =>
        Promise.resolve(
          String(url).includes('documentId')
            ? { canEdit, clientId: client }
            : { items: [] }
        )
      )
  )
  const apply = vi.fn()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    setup() {
      useEdmConditions(ref(client), ref('document'))
      return () =>
        h(Picker, { condition, eligible, ready: true, onApply: apply })
    }
  })
  app.component('EmailBuilderEdmConditionPredicateEditor', Editor)
  app.component('UButton', {
    props: ['label', 'disabled'],
    emits: ['click'],
    template:
      '<button :disabled="disabled" @click="$emit(\'click\')"><slot>{{ label }}</slot></button>'
  })
  app.component('UModal', {
    props: ['open'],
    template:
      '<section v-if="open"><slot name="body"/><slot name="footer"/></section>'
  })
  app.component('UInput', {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  })
  app.component('USelect', {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template:
      '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{item.label}}</option></select>'
  })
  app.component('UFormField', {
    props: ['label'],
    template: '<label>{{label}}<slot/></label>'
  })
  app.component('UBadge', { template: '<span><slot/></span>' })
  app.component('UAlert', { template: '<aside />' })
  app.mount(host)
  dispose = () => {
    app.unmount()
    host.remove()
  }
  return { host, apply }
}
const button = (host: Element, label: string) =>
  [...host.querySelectorAll('button')].find(value =>
    value.textContent?.includes(label)
  )!
describe('recipient condition picker', () => {
  it('displays existing conditions read-only for staff and protects required sections', async () => {
    const { host } = mount(false)
    await flush()
    expect(host.textContent).toContain('Known name')
    expect(button(host, 'Edit condition')).toBeUndefined()
  })
  it('copies a typed predicate and supports bounded nested all/any editing', async () => {
    const { host, apply } = mount(true)
    await flush()
    button(host, 'Edit condition').click()
    await flush()
    expect(host.querySelectorAll('input')[0]?.value).toBe('Known name')
    const match = [...host.querySelectorAll('select')].find(el =>
      [...el.options].some(option => option.value === 'all')
    )!
    match.value = 'all'
    match.dispatchEvent(new Event('change'))
    await flush()
    expect(button(host, 'Add rule')).toBeDefined()
    button(host, 'Add rule').click()
    await flush()
    button(host, 'Apply to block').click()
    await flush()
    expect(apply).toHaveBeenCalledWith({
      version: 1,
      name: 'Known name',
      predicate: { op: 'all', terms: [rule, rule] }
    })
  })
  it('hides editing for a protected block even with designer discovery', async () => {
    const { host } = mount(true, false)
    await flush()
    expect(button(host, 'Edit condition')).toBeUndefined()
    expect(host.textContent).toContain('Required, legal, locked and linked')
  })
})
