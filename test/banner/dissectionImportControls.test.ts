// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import DissectorModal from '../../app/components/banner/DissectorModal.client.vue'

const capability = vi.hoisted(() => ({ enabled: true }))
vi.mock('../../shared/bannerDissectionCapabilities', () => ({ get SCOPED_DISSECTION_ADMISSION_ENABLED() { return capability.enabled } }))
const completed = { resultId: 'a'.repeat(64), jobId: 'job', status: 'complete', banner_size: '300x250', brand: 'Test', tokens: {}, layers: [{ id: 'background', type: 'background', description: 'Background', extraction_status: 'extracted', region: { x: 0, y: 0, width: 1, height: 1 } }] }
async function settle() {
  for (let i = 0; i < 12; i++) await nextTick()
}
const cleanups: Array<() => void> = []
afterEach(() => {
  capability.enabled = true
  cleanups.splice(0).forEach(fn => fn())
  vi.unstubAllGlobals()
})
async function mount(importResponse: () => Promise<unknown>, snapshot: Record<string, unknown> | null = completed, project: { id: string, updatedAt: string, clientId?: string | null } | null = { id: 'project', updatedAt: 'revision-1' }) {
  const state = reactive({ activeKey: 'mrec', project, isDirty: false, isSaving: false, sets: { mrec: { layers: [] } } })
  const applyAssistantCanvas = vi.fn()
  const navigate = vi.fn()
  const withCanvasUndo = vi.fn((fn: () => void) => fn())
  const fetcher = vi.fn(async (url: string, _options?: { body?: unknown, query?: unknown }) => url.endsWith('/history') ? { dissections: snapshot ? [{ jobId: 'job', status: snapshot.status }] : [] } : url.endsWith('/import') ? importResponse() : snapshot ?? { jobId: 'uploaded', status: 'queued' })
  for (const [key, value] of Object.entries({ computed, ref, watch, onUnmounted, $fetch: fetcher, navigateTo: navigate, useBannerStudio: () => ({ state, nextId: () => 1, getCanvasData: () => structuredClone(JSON.parse(JSON.stringify(state.sets))), applyAssistantCanvas, withCanvasUndo }), useToast: () => ({ add: vi.fn() }) })) vi.stubGlobal(key, value)
  const opened = ref(true)
  const app = createApp({ setup: () => () => h(DissectorModal, {
    'open': opened.value,
    'onUpdate:open': (value: boolean) => { opened.value = value }
  }) })
  app.component('UModal', defineComponent({ props: ['open'], setup: (props, { slots }) => () => props.open ? h('main', slots.content?.()) : null }))
  app.component('UButton', defineComponent({ props: ['label', 'disabled'], setup: (props, { attrs }) => () => h('button', { ...attrs, disabled: props.disabled }, props.label) }))
  app.component('UAlert', defineComponent({ props: ['title', 'description'], setup: props => () => h('aside', [props.title, props.description]) }))
  let chooseFile!: (file: File) => void
  app.component('UFileUpload', defineComponent({ props: ['accept'], setup: (props, { emit }) => {
    chooseFile = file => emit('update:modelValue', file)
    return () => h('div', { 'data-accept': props.accept })
  } }))
  app.component('UFormField', defineComponent({ props: ['label'], setup: (props, { slots }) => () => h('section', { 'data-label': props.label }, slots.default?.()) }))
  app.component('USelectMenu', defineComponent({ props: ['items', 'disabled'], setup: (props, { emit }) => () => h('div', props.items?.map((item: { label: string, value: string }) => h('button', { disabled: props.disabled, onClick: () => emit('update:modelValue', item.value) }, item.label))) }))
  for (const name of ['UInput', 'UIcon', 'UBadge', 'UTextarea', 'UProgress']) app.component(name, defineComponent({ setup: (_props, { slots }) => () => h('div', slots.default?.()) }))
  const host = document.createElement('div')
  app.mount(host)
  cleanups.push(() => app.unmount())
  await settle()
  const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label)!
  return { state, fetcher, applyAssistantCanvas, withCanvasUndo, navigate, opened, button, host, chooseFile: (file: File) => chooseFile(file) }
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
    expect(view.withCanvasUndo).toHaveBeenCalledTimes(1)
    expect(view.state.project!.updatedAt).toBe('revision-2')
  })
  it.each(['dirty', 'saving', 'revision', 'canvas', 'reloaded'])('rejects %s artwork before requesting an import', async (change) => {
    const view = await mount(async () => ({}))
    if (change === 'dirty') view.state.isDirty = true
    if (change === 'saving') view.state.isSaving = true
    if (change === 'revision') view.state.project!.updatedAt = 'revision-other'
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
    if (change === 'revision') view.state.project!.updatedAt = 'revision-3'
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
  it('keeps verified source dimensions instead of choosing the closest preset', async () => {
    const view = await mount(async () => ({ projectId: 'project', formatKey: 'custom_2480x3508', layers: [{ id: 4, type: 'image' }], revision: 'revision-2', receiptId: 'custom-receipt' }), { ...completed, banner_size: '300x250', source: { width: 2480, height: 3508, mimeType: 'image/png', byteLength: 123, sha256: 'b'.repeat(64) } })
    view.button('Import to Editor').click()
    await settle()
    expect(view.fetcher).toHaveBeenCalledWith('/api/agency/banner-studio/dissect/job/import', expect.objectContaining({ body: expect.objectContaining({ formatKey: 'custom_2480x3508' }) }))
    expect(view.state.activeKey).toBe('custom_2480x3508')
    expect(view.applyAssistantCanvas).toHaveBeenCalledWith(expect.objectContaining({ custom_2480x3508: { layers: [expect.objectContaining({ type: 'image' })] } }))
  })

  it('clears findings and changes history scope when the project changes', async () => {
    const view = await mount(async () => ({}))
    view.fetcher.mockImplementation(async () => ({ dissections: [] }))
    view.state.project = { id: 'different-project', updatedAt: 'revision-1' }
    await settle()
    expect(view.host.textContent).not.toContain('Background')
    expect(view.button('Import to Editor')).toBeUndefined()
    expect(view.fetcher).toHaveBeenLastCalledWith('/api/agency/banner-studio/dissect/history', { query: { projectId: 'different-project' } })
  })

  it('disables new-project creation for a project-owned analysis', async () => {
    const view = await mount(async () => ({}), { ...completed, ingestion: { ownerKind: 'project', projectId: 'project', physical: null } })
    expect(view.button('New Project').disabled).toBe(true)
    expect(view.button('Import to Editor').disabled).toBe(false)
    view.button('New Project').click()
    await settle()
    expect(view.fetcher.mock.calls.some(([url]) => url.endsWith('/import'))).toBe(false)
  })

  it.each([
    { ownerKind: 'project', projectId: 'other', clientId: 'client-a', physical: null },
    { ownerKind: 'client', clientId: 'client-b', physical: null },
    { ownerKind: 'user', physical: null },
    undefined
  ])('blocks incompatible ownership without a personal fallback: %j', async (ingestion) => {
    const view = await mount(async () => ({}), { ...completed, ingestion }, { id: 'project', updatedAt: 'revision-1', clientId: 'client-a' })
    expect(view.button('New Project').disabled).toBe(true)
    expect(view.button('Import to Editor').disabled).toBe(true)
    view.button('New Project').click()
    view.button('Import to Editor').click()
    await settle()
    expect(view.fetcher.mock.calls.some(([url]) => url.endsWith('/import'))).toBe(false)
  })

  it('asserts the same client when creating a project from a client job', async () => {
    const view = await mount(async () => ({}), { ...completed, ingestion: { ownerKind: 'client', clientId: 'client-a', physical: null } }, { id: 'project', updatedAt: 'revision-1', clientId: 'client-a' })
    view.button('New Project').click()
    await settle()
    expect(view.fetcher).toHaveBeenCalledWith('/api/agency/banner-studio/dissect/job/import', expect.objectContaining({ body: expect.objectContaining({ clientId: 'client-a' }) }))
  })

  it('clears client findings and ignores an import receipt after the client changes in place', async () => {
    let finish!: (value: unknown) => void
    const view = await mount(() => new Promise((resolve) => {
      finish = resolve
    }), { ...completed, ingestion: { ownerKind: 'client', clientId: 'client-a', physical: null } }, { id: 'project', updatedAt: 'revision-1', clientId: 'client-a' })
    view.button('Import to Editor').click()
    await settle()
    view.fetcher.mockImplementation(async () => ({ dissections: [] }))
    view.state.project!.clientId = 'client-b'
    await settle()
    expect(view.host.textContent).not.toContain('Detected Layers')
    expect(view.fetcher).toHaveBeenLastCalledWith('/api/agency/banner-studio/dissect/history', { query: { projectId: 'project', clientId: 'client-b' } })
    finish({ projectId: 'project', formatKey: 'mrec', layers: [{ id: 1 }], revision: 'revision-2', receiptId: 'receipt' })
    await settle()
    expect(view.applyAssistantCanvas).not.toHaveBeenCalled()
  })

  it.each([401, 403, 404])('clears findings after an import returns %s', async (status) => {
    const view = await mount(async () => {
      throw { response: { status } }
    })
    view.button('Import to Editor').click()
    await settle()
    expect(view.host.textContent).not.toContain('Detected Layers')
    expect(view.button('Import to Editor')).toBeUndefined()
    expect(view.host.querySelector('[data-label="Saved analyses"]')).toBeNull()
  })

  it('uploads PNG with the captured project/client and explicit physical selection', async () => {
    const view = await mount(async () => ({}), null, { id: 'project', updatedAt: 'revision-1', clientId: 'client-a' })
    view.button('A4').click()
    await settle()
    view.button('Landscape (297 × 210 mm)').click()
    view.chooseFile(new File(['png'], 'art.png', { type: 'image/png' }))
    await settle()
    view.button('Analyze').click()
    await settle()
    const body = view.fetcher.mock.calls.find(([url]) => url.endsWith('/upload'))?.[1]?.body as FormData
    expect(body.get('projectId')).toBe('project')
    expect(body.get('clientId')).toBe('client-a')
    expect(JSON.parse(body.get('physical') as string)).toEqual({ preset: 'A4', orientation: 'landscape' })
  })

  it.each(['image/jpeg', 'image/webp'])('retains %s only for unsaved personal uploads with unknown physical size', async (type) => {
    const view = await mount(async () => ({}), null, null)
    view.chooseFile(new File(['image'], 'legacy', { type }))
    await settle()
    view.button('Analyze').click()
    await settle()
    const body = view.fetcher.mock.calls.find(([url]) => url.endsWith('/upload'))?.[1]?.body as FormData
    expect(body.has('projectId')).toBe(false)
    expect(body.has('clientId')).toBe(false)
    expect(body.has('physical')).toBe(false)
  })

  it.each(['project', 'physical'])('blocks JPEG uploads in %s mode', async (mode) => {
    const view = await mount(async () => ({}), null, mode === 'project' ? { id: 'project', updatedAt: 'revision-1' } : null)
    if (mode === 'physical') {
      view.button('A4').click()
      await settle()
    }
    view.chooseFile(new File(['jpeg'], 'image.jpg', { type: 'image/jpeg' }))
    await settle()
    expect(view.button('Analyze').disabled).toBe(true)
    expect(view.host.querySelector('[data-accept="image/png"]')).not.toBeNull()
  })

  it('clears the selected upload on access denial without retrying in personal mode', async () => {
    const view = await mount(async () => ({}), null, { id: 'project', updatedAt: 'revision-1', clientId: 'client-a' })
    view.fetcher.mockImplementation(async () => {
      throw { statusCode: 403 }
    })
    view.chooseFile(new File(['png'], 'art.png', { type: 'image/png' }))
    await settle()
    view.button('Analyze').click()
    await settle()
    expect(view.button('Analyze').disabled).toBe(true)
    expect(view.host.textContent).toContain('Saved to this project')
    expect(view.fetcher.mock.calls.filter(([url]) => url.endsWith('/upload'))).toHaveLength(1)
  })

  it('does not infer A4 or change source pixels from a physical selection', async () => {
    const view = await mount(async () => ({}), { ...completed, source: { width: 1600, height: 900, mimeType: 'image/png', byteLength: 123, sha256: 'b'.repeat(64) }, ingestion: { ownerKind: 'user', physical: { preset: 'A4', orientation: 'portrait', unit: 'mm', widthMm: 210, heightMm: 297 } } })
    view.button('Import to Editor').click()
    await settle()
    expect(view.fetcher).toHaveBeenCalledWith('/api/agency/banner-studio/dissect/job/import', expect.objectContaining({ body: expect.objectContaining({ formatKey: 'custom_1600x900' }) }))
    expect(view.host.textContent).toContain('Selected physical size: A4 portrait')
  })

  it('retains protected asset locators in the single undo canvas apply', async () => {
    const imageUrl = '/api/agency/banner-studio/dissect/job/assets/background'
    const view = await mount(async () => ({ projectId: 'project', formatKey: 'mrec', layers: [{ id: 4, type: 'image', src: imageUrl }], revision: 'revision-2', receiptId: 'receipt', dissectionSource: { jobId: 'job', sourceSha256: 'b'.repeat(64) } }), { ...completed, ingestion: { ownerKind: 'project', projectId: 'project', physical: null } })
    view.button('Import to Editor').click()
    await settle()
    expect(view.applyAssistantCanvas).toHaveBeenCalledWith(expect.objectContaining({ mrec: expect.objectContaining({ layers: [expect.objectContaining({ src: imageUrl })] }) }))
    expect(view.withCanvasUndo).toHaveBeenCalledTimes(1)
    expect(view.fetcher.mock.calls.filter(([url]) => !url.includes('/dissect/'))).toEqual([])
  })
  it('retains scoped source provenance even when an import has only text layers', async () => {
    const dissectionSource = { jobId: 'job', sourceSha256: 'b'.repeat(64) }
    const view = await mount(async () => ({ projectId: 'project', formatKey: 'mrec', layers: [{ id: 4, type: 'text', text: 'Offer' }], revision: 'revision-2', receiptId: 'receipt', dissectionSource }), { ...completed, ingestion: { ownerKind: 'project', projectId: 'project', physical: null } })
    view.button('Import to Editor').click()
    await settle()
    expect(view.applyAssistantCanvas).toHaveBeenCalledWith(expect.objectContaining({ mrec: expect.objectContaining({ dissectionSource, layers: [expect.objectContaining({ type: 'text' })] }) }))
    expect(view.withCanvasUndo).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, { jobId: 'other', sourceSha256: 'b'.repeat(64) }, { jobId: 'job', sourceSha256: 'invalid' }])('does not apply a scoped import with missing or mismatched provenance: %j', async (dissectionSource) => {
    const view = await mount(async () => ({ projectId: 'project', formatKey: 'mrec', layers: [{ id: 4, type: 'text' }], revision: 'revision-2', receiptId: 'receipt', dissectionSource }), { ...completed, ingestion: { ownerKind: 'project', projectId: 'project', physical: null } })
    view.button('Import to Editor').click()
    await settle()
    expect(view.applyAssistantCanvas).not.toHaveBeenCalled()
    expect(view.withCanvasUndo).not.toHaveBeenCalled()
  })
  it('binds import provenance to the verified source hash', async () => {
    const view = await mount(async () => ({ projectId: 'project', formatKey: 'mrec', layers: [{ id: 4, type: 'text' }], revision: 'revision-2', receiptId: 'receipt', dissectionSource: { jobId: 'job', sourceSha256: 'b'.repeat(64) } }), { ...completed, source: { width: 300, height: 250, mimeType: 'image/png', byteLength: 123, sha256: 'c'.repeat(64) }, ingestion: { ownerKind: 'project', projectId: 'project', physical: null } })
    view.button('Import to Editor').click()
    await settle()
    expect(view.applyAssistantCanvas).not.toHaveBeenCalled()
    expect(view.state.project!.updatedAt).toBe('revision-1')
  })
})

it('shows unavailable scoped admission and does not submit an in-project upload', async () => {
  capability.enabled = false
  const view = await mount(async () => ({}), null)
  expect(view.host.textContent).toContain('Project uploads aren’t available yet')
  const analyze = [...view.host.querySelectorAll('button')].find(button => button.textContent === 'Analyze')!
  expect(analyze.disabled).toBe(true)
  analyze.click()
  await settle()
  expect(view.fetcher.mock.calls.some(([url]) => url.endsWith('/upload'))).toBe(false)
})
