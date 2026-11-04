// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref } from 'vue'
import Settings from '../../app/components/email/builder/BlockSettingsPanel.vue'
import { useEdmBuilder } from '../../app/composables/useEdmBuilder'
import { createEmptyDocument } from '../../app/types/edm'
import { renderTemplateDocumentLocally } from '../../workers/email-rendering/src/render/document'
import { resolveEmailMergeTags } from '../../shared/emailRendering/mergeTags'
import { sampleMergeVariables } from '../../shared/emailRendering/mergeTagDefinitions'

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
function mount(type: string, key: string, value: string) {
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('ref', ref)
  const store = useEdmBuilder()
  const doc = createEmptyDocument()
  doc.link = { type, data: { props: { text: 'Offer', alt: 'Car', url: 'https://images.example/car.png', [key]: value }, style: { color: '#123456' } } }
  doc.root.data.childrenIds = ['link']
  store.resetDocument(doc)
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Settings, {
    block: { id: 'link', ...store.document.value.link },
    onUpdate: (update: { props?: Record<string, unknown> }) => {
      if (update.props) store.updateBlockProps('link', update.props)
    }
  }) })
  app.component('UButton', { props: ['label', 'disabled'], template: '<button :disabled="disabled"><slot />{{ label }}</button>' })
  app.component('UPopover', { props: ['open'], emits: ['update:open'], template: '<div><span @click="$emit(\'update:open\', !open)"><slot /></span><div v-if="open" data-menu><slot name="content" /></div></div>' })
  app.component('UFormField', { props: ['label', 'help'], template: '<label>{{label}}<slot/><small>{{help}}</small></label>' })
  app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('USelect', { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{item.label}}</option></select>' })
  for (const name of ['UIcon', 'USlider', 'UCheckbox', 'UBadge', 'UTooltip', 'UTextarea', 'EmailBuilderEdmMergeTagPicker']) app.component(name, { template: '<span><slot/></span>' })
  app.mount(host)
  dispose = () => app.unmount()
  const button = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.trim() === label)!
  return { host, store, button }
}
async function choose(host: HTMLElement, choice: string) {
  const select = host.querySelector<HTMLSelectElement>('[data-menu] select')!
  select.value = choice
  select.dispatchEvent(new Event('change'))
  await flush()
}
describe('composer link targets', () => {
  it.each([['Button', 'url'], ['Image', 'linkHref']])('chooses and reopens exact special targets on %s through the property/store boundary', async (type, key) => {
    const { host, store, button } = mount(type!, key!, 'https://offers.example/path?q=1#offer')
    expect(store.document.value.link.data.props?.[key!]).toBe('https://offers.example/path?q=1#offer')
    button('Link target').click()
    await flush()
    await choose(host, 'web')
    button('Cancel').click()
    await flush()
    expect(store.document.value.link.data.props?.[key!]).toBe('https://offers.example/path?q=1#offer')
    for (const [choice, expected] of [['web', '{{web_version_url}}'], ['unsubscribe', '{{unsubscribe_url}}']]) {
      button('Link target').click()
      await flush()
      await choose(host, choice!)
      expect(host.textContent).toContain('review')
      button('Use link').click()
      await flush()
      const saved = JSON.stringify(store.document.value)
      store.resetDocument()
      store.setDocument(JSON.parse(saved))
      await flush()
      expect(store.document.value.link.data.props?.[key!]).toBe(expected)
      const html = renderTemplateDocumentLocally(store.document.value)
      expect(html).toContain(`href="${expected}"`)
      const preview = resolveEmailMergeTags(html, sampleMergeVariables([], {}))
      expect(preview).toContain(choice === 'web' ? 'https://example.invalid/email/view' : 'https://example.invalid/unsubscribe')
      expect(store.document.value.link.data.style?.color).toBe('#123456')
      button('Link target').click()
      await flush()
      expect(host.querySelector<HTMLSelectElement>('[data-menu] select')?.value).toBe(choice)
      button('Cancel').click()
      await flush()
    }
    button('Link target').click()
    await flush()
    await choose(host, 'url')
    const input = host.querySelector<HTMLInputElement>('[data-menu] input')!
    input.value = 'mailto:sales@example.com?subject=Offer'
    input.dispatchEvent(new Event('input'))
    await flush()
    button('Use link').click()
    await flush()
    expect(store.document.value.link.data.props?.[key!]).toBe('mailto:sales@example.com?subject=Offer')
  })
})
