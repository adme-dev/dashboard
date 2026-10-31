// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, reactive, ref, shallowRef, toRaw, watch, type App } from 'vue'

const api = vi.fn()
const readBatch = vi.fn()
const refreshFonts = vi.fn(async () => [])
vi.mock('~/utils/thebrief-import-batch', () => ({ readImportBatch: (...args: unknown[]) => readBatch(...args) }))
let app: App | undefined, host: HTMLDivElement
const clientId = '11111111-1111-4111-8111-111111111111'
const hash = 'a'.repeat(64)
const source = { designHash: 'blood-oct', sha256: hash, folder: 'Blood', duration: 4, loopCount: 0 }
const canvas = { custom_300x250: { layers: [{ id: 1, type: 'text', name: 'Headline', text: 'Corrected', x: 0, y: 0, w: 300, h: 100, opacity: 1, zIndex: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 4 }] } }
const original = {
  id: 'draft-id', name: 'Saved producer title', clientId, folderId: 'existing-folder', status: 'draft', updatedAt: '2026-10-31T01:00:00.000Z',
  canvasData: { custom_1200x1200: { layers: [] } }, tags: ['source:thebrief', `source-sha256:${hash}`, 'source-design:blood-oct', 'import:needs-review']
}
const saved = { ...original, canvasData: canvas, updatedAt: '2026-10-31T02:00:00.000Z', refreshed: true }
const pkg = { kind: 'xeroflow-thebrief-import', version: 1, name: 'Blood prepared package', source, canvasData: canvas, warnings: [], assets: [], fonts: [] }
let patched = false
let patchFailure: unknown = null
let imported: ReturnType<typeof vi.fn>
const stubs = {
  UModal: defineComponent({ props: ['open', 'title'], setup: (p, { slots }) => () => p.open ? h('section', { 'aria-label': p.title }, [slots.body?.(), slots.footer?.()]) : null }),
  UFormField: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
  UFileUpload: defineComponent({ props: ['disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('button', { disabled: p.disabled, onClick: () => emit('update:modelValue', [new File(['{}'], 'prepared.json')]) }, 'Load packages') }),
  USelectMenu: defineComponent({ props: ['modelValue'], setup: p => () => h('span', String(p.modelValue)) }),
  UBadge: defineComponent({ setup: (_, { slots }) => () => h('span', slots.default?.()) }),
  UAlert: defineComponent({ props: ['title', 'description'], setup: p => () => h('p', `${p.title}: ${p.description}`) }),
  UButton: defineComponent({ props: ['disabled', 'loading', 'to'], emits: ['click'], setup: (p, { slots, emit }) => () => h('button', { 'disabled': p.disabled || p.loading, 'data-to': p.to, 'onClick': () => emit('click') }, slots.default?.()) })
}
async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}
function button(label: string) {
  return [...host.querySelectorAll('button')].find(el => el.textContent?.trim() === label)!
}
async function click(label: string) {
  const el = button(label)
  expect(el).toBeDefined()
  el.click()
  await flush()
}
async function mountModal() {
  for (const [name, value] of Object.entries({ ref, shallowRef, computed, watch, toRaw, $fetch: api })) vi.stubGlobal(name, value)
  vi.stubGlobal('useBannerFonts', () => ({ uploadCustomFont: vi.fn(), refreshCustomFonts: refreshFonts }))
  const { default: Modal } = await import('../../app/components/banner/TheBriefImportModal.client.vue')
  const props = reactive({ open: false })
  app = createApp({ render: () => h(Modal, { ...props, onImported: imported }) })
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub)
  host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  props.open = true
  await flush()
  await click('Load packages')
  await click('Import assigned drafts')
}
beforeEach(() => {
  patched = false
  patchFailure = null
  imported = vi.fn()
  localStorage.clear()
  readBatch.mockReset().mockImplementation(async () => [{ file: new File(['{}'], 'prepared.json'), pkg: structuredClone(pkg), clientId, folderId: '__unfiled__', status: 'Ready' }])
  api.mockReset().mockImplementation(async (url: string, options?: { method?: string }) => {
    if (url.endsWith('/clients')) return [{ id: clientId, name: 'Blood Motor Group' }]
    if (url.endsWith('/folders')) return []
    if (url.endsWith('/projects')) return [structuredClone(original)]
    if (url.endsWith('/thebrief-refresh')) {
      if (patchFailure) throw patchFailure
      patched = true
      expect(options.method).toBe('PATCH')
      return structuredClone(saved)
    }
    if (url.endsWith('/projects/draft-id')) return structuredClone(patched ? saved : original)
    throw new Error(`Unexpected request ${url}`)
  })
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.unstubAllGlobals()
})

describe('explicit imported draft update', () => {
  it('does not overwrite a duplicate during import and shows a concrete version-backup confirmation', async () => {
    await mountModal()
    expect(host.textContent).toContain('Already imported')
    expect(api.mock.calls.some(([, options]) => options?.method)).toBe(false)
    await click('Update imported draft')
    expect(host.textContent).toContain('Saved producer title')
    expect(host.textContent).toContain('Blood Motor Group')
    expect(host.textContent).toContain('Replacing sizes: 1200x1200')
    expect(host.textContent).toContain('Prepared sizes: 300x250')
    expect(host.textContent).toContain('saved in version history before replacement')
    expect(api.mock.calls.some(([, options]) => options?.method)).toBe(false)
    await click('Back up and update draft')
    const writes = api.mock.calls.filter(([, options]) => options?.method)
    expect(writes).toHaveLength(1)
    expect(writes[0]?.[1]).toEqual({ method: 'PATCH', body: { clientId, expectedUpdatedAt: original.updatedAt, source, canvasData: canvas } })
    expect(imported).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('previous canvas saved in version history')
  })
  it('retains the expected revision and prepared canvas when retrying an uncertain response', async () => {
    await mountModal()
    await click('Update imported draft')
    patchFailure = new TypeError('Connection reset')
    await click('Back up and update draft')
    expect(imported).not.toHaveBeenCalled()
    patchFailure = null
    await click('Retry same update')
    const writes = api.mock.calls.filter(([, options]) => options?.method === 'PATCH')
    expect(writes).toHaveLength(2)
    expect(writes[1]![1].body).toEqual(writes[0]![1].body)
    expect(imported).toHaveBeenCalledOnce()
  })
  it('stops on a revision conflict and requires a newly reviewed confirmation', async () => {
    await mountModal()
    await click('Update imported draft')
    patchFailure = { statusCode: 409, data: { statusMessage: 'The draft changed while preparing' } }
    await click('Back up and update draft')
    expect(host.textContent).toContain('The draft changed while preparing')
    expect(button('Back up and update draft').disabled).toBe(true)
    expect(host.textContent).toContain('review its latest revision')
    expect(imported).not.toHaveBeenCalled()
  })
  it('does not dispatch an update after cancelling the confirmation', async () => {
    await mountModal()
    await click('Update imported draft')
    await click('Cancel')
    expect(host.querySelector('[aria-label="Update imported draft"]')).toBeNull()
    expect(api.mock.calls.some(([, options]) => options?.method)).toBe(false)
  })
})
