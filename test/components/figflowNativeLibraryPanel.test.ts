// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import Panel from '../../app/components/email/builder/EdmDesignLibraryPanel.vue'
import { useEdmDesignRoundtrip } from '../../app/composables/useEdmDesignRoundtrip'
import { insertDesignImage } from '../../shared/emailRendering/designModules'
import { structuredDesign } from '../fixtures/email-design/structured'

const id = '10000000-0000-4000-8000-000000000001', head = '20000000-0000-4000-8000-000000000001'
const asset = { id, sha256: 'a'.repeat(64), mimeType: 'image/png' as const, bytes: 24, width: 1, height: 1 }
let dispose: (() => void) | undefined
async function flush() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
async function mount(target: {
  parentId: string
  columnIndex?: number
  index: number
} | null) {
  const source = insertDesignImage(structuredDesign(), asset, 'https://app.test/image.png', id, { parentId: 'root', index: 1 })
  const flow = useEdmDesignRoundtrip(), actions = vi.fn()
  flow.draft.value = { state: 'structured', documentId: id, templateId: id, headRevisionId: head, projectionRevisionId: head, source, projection: { state: 'current' } }
  flow.libraryAuthoring.value = { available: true, publisher: true }
  const module = { id, name: 'Hero', revision_schema_version: 1, head_revision_id: head, client_id: null }
  const image = { id, url: 'https://app.test/image.png', name: 'Registered', mimeType: 'image/png', fileSize: 24, clientId: null, emailPublication: asset }
  vi.stubGlobal('$fetch', vi.fn(async (url: string) => url.includes('/agency/email/modules')
    ? { items: [module] }
    : url.includes('/agency/email/assets') ? { assets: [image] } : { moduleId: id, revisionId: head, design: { ...source, kind: 'module' }, previewHtml: '<p>Module</p>' }))
  const states = new Map<string, ReturnType<typeof ref>>()
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!states.has(key))
      states.set(key, ref(init()))
    return states.get(key)
  })
  const host = document.createElement('div'), app = createApp({ render: () => h(Panel, { flow, blocked: false, saved: true, selectedId: `img_${id}`, selectedRoots: [`img_${id}`], insertionTarget: target, onModule: actions }) })
  app.component('UButton', { props: ['label', 'disabled'], template: '<button :disabled="disabled">{{label}}</button>' })
  app.component('UFormField', { props: ['label'], template: '<label>{{label}}<slot /></label>' })
  app.component('USelect', { props: ['items', 'modelValue', 'disabled'], emits: ['update:modelValue'], template: '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{item.label}}</option></select>' })
  app.component('UInput', { props: ['modelValue'], template: '<input :value="modelValue">' })
  app.component('UCheckbox', { props: ['label'], template: '<span>{{label}}</span>' })
  app.component('UAlert', { props: ['title'], template: '<div>{{title}}</div>' })
  app.component('EmailBuilderEdmImageLibraryPicker', { emits: ['pick'], template: '<button @click="$emit(\'pick\', image)">Pick fixture image</button>', data: () => ({ image }) })
  app.mount(host)
  dispose = () => app.unmount()
  await flush()
  const click = async (label: string) => {
    Array.from(host.querySelectorAll('button')).find(b => b.textContent === label)!.click()
    await flush()
  }
  return { host, flow, actions, click }
}
describe('explicit native insertion and registered-image UI', () => {
  it('uses the exact column-zero target instead of appending at root', async () => {
    const f = await mount({ parentId: 'columns', columnIndex: 0, index: 2 })
    const select = f.host.querySelector('select')!
    select.value = id
    select.dispatchEvent(new Event('change'))
    await flush()
    await f.click('Insert selected version')
    expect(f.actions).toHaveBeenCalledWith({ command: 'insert-module', moduleId: id, revisionId: head, parentId: 'columns', columnIndex: 0, index: 2 })
  })
  it('offers typed replacement for selected images and disables insertion without a mapped target', async () => {
    const f = await mount(null)
    await f.click('Choose or upload an image')
    await f.click('Pick fixture image')
    expect(Array.from(f.host.querySelectorAll('button')).find(b => b.textContent === 'Insert published image')!.disabled).toBe(true)
    await f.click('Replace selected image')
    expect(f.actions).toHaveBeenCalledWith({ command: 'replace-published-image', assetId: id, blockId: `img_${id}` })
    expect(f.actions.mock.calls[0][0]).not.toHaveProperty('url')
  })
})
