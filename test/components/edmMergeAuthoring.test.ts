// @vitest-environment happy-dom
import { computed, createApp, h, nextTick, reactive, ref, type Component } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Picker from '../../app/components/email/builder/EdmMergeTagPicker.vue'
import Renderer from '../../app/components/email/builder/EdmBlockRenderer.vue'
import Settings from '../../app/components/email/builder/BlockSettingsPanel.vue'
import { useEdmMergeTags } from '../../app/composables/useEdmMergeTags'

const definition = { id: 'id', client_id: '11111111-1111-4111-8111-111111111111', token: 'custom_offer', name: 'Offer', preview_value: 'Sample', fallback: 'Ask us' }
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
function mount(component: Component, props: Record<string, unknown>) {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('reactive', reactive)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ setup() {
    useEdmMergeTags(ref(definition.client_id))
    return () => h(component, props)
  } })
  app.component('EmailBuilderEdmMergeTagPicker', Picker)
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot>{{ label }}</slot></button>' })
  app.component('UPopover', { template: '<div><slot/><slot name="content"/></div>' })
  app.component('UFormField', { template: '<label><slot/></label>' })
  app.component('UIcon', { template: '<span />' })
  for (const name of ['UInput', 'UTextarea', 'USelect', 'UCheckbox', 'USlider']) app.component(name, { template: '<span />' })
  app.mount(host)
  dispose = () => {
    app.unmount()
    host.remove()
  }
  return host
}
describe('merge picker and existing block surfaces', () => {
  it('inserts a custom canonical token from the supported picker', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ items: [definition] }))
    const insert = vi.fn()
    const host = mount(Picker, { onInsert: insert })
    await flush()
    Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Offer'))!.click()
    expect(insert).toHaveBeenCalledWith('{{custom_offer | Ask us}}')
  })
  it('renders atomic text chips and emits canonical stored tokens on blur', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ items: [definition] }))
    const update = vi.fn()
    const host = mount(Renderer, { 'type': 'Text', 'editable': true, 'props': { text: 'Hi {{first_name | there}}' }, 'onUpdate:text': update })
    await flush()
    const editor = host.querySelector('[contenteditable="true"]')!
    expect(editor.querySelector('[data-merge]')?.getAttribute('contenteditable')).toBe('false')
    editor.appendChild(document.createTextNode('!'))
    editor.dispatchEvent(new FocusEvent('blur'))
    expect(update).toHaveBeenCalledWith('Hi {{first_name | there}}!')
    expect(update.mock.calls[0][0]).not.toContain('data-merge')
  })
  it.each(['Heading', 'Button'])('appends a token through the selected %s property panel', async (type) => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ items: [definition] }))
    const update = vi.fn()
    const host = mount(Settings, { block: { id: 'b', type, data: { props: { text: 'Hello' } } }, onUpdate: update })
    await flush()
    Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Offer'))!.click()
    expect(update).toHaveBeenCalledWith({ props: { text: 'Hello {{custom_offer | Ask us}}' } })
  })
})
