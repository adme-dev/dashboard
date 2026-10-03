// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { computed, createApp, h, nextTick, provide, ref, useId } from 'vue'
import { formFieldInjectionKey, inputIdInjectionKey, useFormField } from '../../node_modules/@nuxt/ui/dist/runtime/composables/useFormField.js'

Object.assign(globalThis, { computed, ref, useId })
const Field = (await import('~~/app/components/briefs/BriefFormField.vue')).default
let cleanup = () => {}
afterEach(() => cleanup())
it('each option label toggles its own value, including when the form is shown twice', async () => {
  const values = [ref<string[]>([]), ref<string[]>([])]
  const field = { fieldKey: 'content_type', fieldLabel: 'Content Type', fieldType: 'checkboxgroup', options: [{ value: 'static', label: 'Static Post' }, { value: 'reel', label: 'Reel / Short Video' }] }
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h('div', values.map(value => h(Field, { field, 'modelValue': value.value, 'onUpdate:modelValue': (v: string[]) => {
    value.value = v
  } }))) })
  app.component('UFormField', { props: ['name', 'label'], setup(props, { slots }) {
    provide(formFieldInjectionKey, computed(() => props))
    provide(inputIdInjectionKey, ref(useId()))
    return () => h('section', slots.default?.())
  } })
  // Use the installed Nuxt UI form-context logic that caused the shared IDs.
  app.component('UCheckbox', { props: ['id', 'modelValue', 'label', 'disabled'], emits: ['update:modelValue'], setup(props, { emit }) {
    const { id } = useFormField(props)
    const checkboxId = id.value ?? useId()
    return () => h('div', [h('input', { id: checkboxId, type: 'checkbox', checked: props.modelValue, disabled: props.disabled, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked) }), h('label', { for: checkboxId }, props.label)])
  } })
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  const labels = [...host.querySelectorAll('label')]
  labels[1]!.click()
  await nextTick()
  expect(values[0]!.value).toEqual(['reel'])
  expect(values[1]!.value).toEqual([])
  labels[3]!.click()
  await nextTick()
  expect(values[1]!.value).toEqual(['reel'])
  expect(new Set([...host.querySelectorAll('input')].map(input => input.id)).size).toBe(4)
})
