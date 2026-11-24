// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import EditableName from '~/components/banner/EditableName.vue'

let app: Vue.App
afterEach(() => {
  app?.unmount()
  vi.unstubAllGlobals()
})

it.each(['Layer', 'Group'] as const)('renames a %s by double-click or double-tap and supports cancellation', async (kind) => {
  for (const [key, value] of Object.entries(Vue)) vi.stubGlobal(key, value)
  const rename = vi.fn()
  const host = document.createElement('div')
  app = Vue.createApp(EditableName, { kind, name: 'Original', onRename: rename })
  app.component('UFormField', { setup: (_, { slots }) => () => Vue.h('label', slots.default?.()) })
  app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], setup: (p, { emit }) =>
    () => Vue.h('input', { value: p.modelValue, onInput: e => emit('update:modelValue', (e.target as HTMLInputElement).value) }) })
  app.mount(host)
  host.querySelector('[role=button]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await Vue.nextTick()
  const input = host.querySelector('input')!
  input.value = '  Logo  '
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  expect(rename).toHaveBeenCalledWith('Logo')
  await Vue.nextTick()
  const label = host.querySelector('[role=button]')!
  for (let i = 0; i < 2; i++) label.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }))
  await Vue.nextTick()
  const second = host.querySelector('input')!
  expect(second).toBeTruthy()
  second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  second.dispatchEvent(new Event('blur'))
  expect(rename).toHaveBeenCalledTimes(1)
})
