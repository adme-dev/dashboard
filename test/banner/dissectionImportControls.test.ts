// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import DissectorModal from '../../app/components/banner/DissectorModal.client.vue'

const completed = { resultId: 'a'.repeat(64), jobId: 'job', status: 'complete', banner_size: '300x250', brand: 'Test', tokens: {}, layers: [{ id: 'background', type: 'background', description: 'Background', extraction_status: 'extracted', region: { x: 0, y: 0, width: 1, height: 1 } }] }
async function settle() {
  for (let i = 0; i < 12; i++) await nextTick()
}
const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn())
  vi.unstubAllGlobals()
})
async function mount(importResponse: () => Promise<unknown>) {
  const state = reactive({ activeKey: 'mrec', project: { id: 'project', updatedAt: 'revision-1' }, isDirty: false, isSaving: false, sets: { mrec: { layers: [] } } })
  const applyAssistantCanvas = vi.fn()
  const navigate = vi.fn()
  const fetcher = vi.fn(async (url: string) => url.endsWith('/history') ? { dissections: [{ jobId: 'job', status: 'complete' }] } : url.endsWith('/import') ? importResponse() : completed)
  for (const [key, value] of Object.entries({ computed, ref, watch, onUnmounted, $fetch: fetcher, navigateTo: navigate, useBannerStudio: () => ({ state, nextId: () => 1, getCanvasData: () => structuredClone(JSON.parse(JSON.stringify(state.sets))), applyAssistantCanvas, withCanvasUndo: (fn: () => void) => fn() }), useToast: () => ({ add: vi.fn() }) })) vi.stubGlobal(key, value)
  const opened = ref(true)
  const app = createApp({ setup: () => () => h(DissectorModal, {
    'open': opened.value,
    'onUpdate:open': (value: boolean) => { opened.value = value }
  }) })
  app.component('UModal', defineComponent({ props: ['open'], setup: (props, { slots }) => () => props.open ? h('main', slots.content?.()) : null }))
  app.component('UButton', defineComponent({ props: ['label', 'disabled'], setup: (props, { attrs }) => () => h('button', { ...attrs, disabled: props.disabled }, props.label) }))
  app.component('UAlert', defineComponent({ props: ['title', 'description'], setup: props => () => h('aside', [props.title, props.description]) }))
  for (const name of ['UFormField', 'UInput', 'USelectMenu', 'UIcon', 'UBadge', 'UTextarea', 'UProgress', 'UFileUpload']) app.component(name, defineComponent({ setup: (_props, { slots }) => () => h('div', slots.default?.()) }))
  const host = document.createElement('div')
  app.mount(host)
  cleanups.push(() => app.unmount())
  await settle()
  const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label)!
  return { state, fetcher, applyAssistantCanvas, navigate, opened, button, host }
}
describe('guarded dissection imports', () => {
  it('sends the saved revision and applies an import in one atomic undo action', async () => {
    const view = await mount(async () => ({ projectId: 'project', formatKey: 'mrec', layers: [{ id: 4, type: 'image' }], revision: 'revision-2', receiptId: 'receipt' }))
    view.button('Import to Editor').click()
    view.button('Import to Editor').click()
    await settle()
    expect(view.fetcher.mock.calls.filter(([url]) => url.endsWith('/import'))).toHaveLength(1)
    expect(view.fetcher).toHaveBeenCalledWith('/api/agency/banner-studio/dissect/job/import', expect.objectContaining({ body: expect.objectContaining({ projectId: 'project', expectedRevision: 'revision-1', expectedResultId: 'a'.repeat(64) }) }))
    expect(view.applyAssistantCanvas).toHaveBeenCalledTimes(1)
    expect(view.state.project.updatedAt).toBe('revision-2')
  })
  it.each(['dirty', 'saving', 'revision', 'canvas', 'reloaded'])('rejects %s artwork before requesting an import', async (change) => {
    const view = await mount(async () => ({}))
    if (change === 'dirty') view.state.isDirty = true
    if (change === 'saving') view.state.isSaving = true
    if (change === 'revision') view.state.project.updatedAt = 'revision-other'
    if (change === 'canvas') Object.assign(view.state.sets, { changed: { layers: [] } })
    if (change === 'reloaded') view.state.project = { id: 'project', updatedAt: 'revision-1' }
    await settle()
    view.button('Import to Editor').click()
    await settle()
    expect(view.fetcher.mock.calls.some(([url]) => url.endsWith('/import'))).toBe(false)
  })
  it.each(['closed', 'reopened', 'edited', 'switched', 'revision'])('does not apply a response after context is %s', async (change) => {
    let finish!: (value: unknown) => void
    const view = await mount(() => new Promise((resolve) => {
      finish = resolve
    }))
    view.button('Import to Editor').click()
    await settle()
    if (change === 'closed') view.opened.value = false
    if (change === 'reopened') {
      view.opened.value = false
      await settle()
      view.opened.value = true
    }
    if (change === 'edited') view.state.isDirty = true
    if (change === 'switched') view.state.project = { id: 'other', updatedAt: 'revision-1' }
    if (change === 'revision') view.state.project.updatedAt = 'revision-3'
    await settle()
    finish({ projectId: 'project', formatKey: 'mrec', layers: [{ id: 1 }], revision: 'revision-2', receiptId: 'receipt' })
    await settle()
    expect(view.applyAssistantCanvas).not.toHaveBeenCalled()
  })
  it('replays a new-project receipt without inserting local layers or navigating twice', async () => {
    const view = await mount(async () => ({ projectId: 'new', formatKey: 'mrec', layers: [{ id: 1 }], revision: 'revision-2', receiptId: 'same-receipt' }))
    view.button('New Project').click()
    await settle()
    view.opened.value = true
    await settle()
    view.button('New Project').click()
    await settle()
    expect(view.applyAssistantCanvas).not.toHaveBeenCalled()
    expect(view.navigate).toHaveBeenCalledTimes(1)
  })
})
