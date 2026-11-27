// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import Library from '../../app/components/banner/ProjectLibrary.client.vue'
import type { BannerProjectSummary } from '../../app/types/banner-studio'

let app: Vue.App | undefined
afterEach(() => {
  app?.unmount()
  vi.unstubAllGlobals()
})

it('loads summaries, defers closed tools and fetches complete artwork only when duplicating', async () => {
  for (const [key, value] of Object.entries(Vue)) vi.stubGlobal(key, value)
  const summary: BannerProjectSummary = {
    id: 'project', name: 'Summer sale', clientId: 'client', clientName: 'Dealer', folderId: null,
    formats: ['fb_sq', 'ig_story'], thumbnailUrl: null,
    status: 'draft', tags: [], createdBy: 'designer', createdAt: '2026-11-24', updatedAt: '2026-11-24'
  }
  const artwork = { fb_sq: { layers: [{ id: 1, text: 'Complete artwork' }] }, ig_story: { layers: [{ id: 2 }] } }
  const catalog = Array.from({ length: 41 }, (_, i) => ({
    ...summary, id: i ? `project-${i}` : 'project', formats: undefined, name: i ? `Z project ${String(i).padStart(2, '0')}` : summary.name
  }))
  const last = catalog.at(-1)!
  const fetch = vi.fn(async (url: string, options?: { method?: string }) => {
    if (options?.method === 'POST') return { project: { id: 'copy' } }
    if (url.endsWith('?view=catalog')) return catalog
    if (url.includes('?view=cards&ids=')) return url.split('ids=')[1]!.split(',').map(id => ({ id, formats: id === last.id ? ['custom_314x271'] : summary.formats }))
    if (url.endsWith('?view=dimensions')) return catalog.map(p => ({ id: p.id, formats: p === last ? ['custom_314x271'] : summary.formats }))
    if (url.endsWith('/folders?view=library')) return { folders: [], canManage: true, pinnedIds: [] }
    if (url.endsWith('/project')) return { ...summary, canvasData: artwork }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('useCookie', () => Vue.ref('grid'))
  vi.stubGlobal('useRoute', () => ({ path: '/agency/banner-studio', params: {}, query: {} }))
  vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  const toolMounted = vi.fn()
  let closeImport = () => {}
  const host = document.createElement('div')
  app = Vue.createApp(Library)
  for (const name of ['UIcon', 'USelect', 'USelectMenu', 'UTabs', 'UPagination', 'USkeleton', 'BannerThemeToggle', 'BannerFolderEditModal', 'BannerFolderBin']) {
    app.component(name, { render: () => null })
  }
  for (const name of ['UFormField', 'UAlert']) {
    app.component(name, { setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) })
  }
  app.component('UInput', { emits: ['update:modelValue'], setup: (_, { emit }) => () => Vue.h('input', { onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }) })
  app.component('UButton', { props: ['label'], setup: (p, { slots, attrs }) => () => Vue.h('button', attrs, p.label || slots.default?.()) })
  app.component('UModal', { props: ['open'], render: () => null })
  for (const name of ['LazyBannerTheBriefImportModal', 'LazyBannerProjectShareModal', 'LazyBannerVideoDownloads']) {
    app.component(name, { emits: ['update:open'], setup: (_, { emit }) => {
      toolMounted()
      if (name === 'LazyBannerTheBriefImportModal') closeImport = () => emit('update:open', false)
      return () => null
    } })
  }
  app.component('BannerLibraryItems', {
    props: ['items'], setup: (p, { slots }) => () => Vue.h('div', p.items.map((item: { id: string, dimensions: string }) => Vue.h('div', [item.dimensions, slots.actions?.({ id: item.id })])))
  })
  app.component('UDropdownMenu', {
    props: ['items'], setup: p => () => Vue.h('button', { 'data-duplicate': true, 'onClick': p.items.flat().find((item: { label: string }) => item.label === 'Duplicate').onSelect }, 'Duplicate')
  })
  app.mount(host)
  for (let i = 0; i < 5; i++) await Vue.nextTick()
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(fetch).toHaveBeenCalledWith('/api/agency/banner-studio/projects?view=catalog')
  const cardsUrl = fetch.mock.calls.find(([url]) => url.includes('?view=cards'))![0]
  expect(cardsUrl.split('ids=')[1]!.split(',')).toHaveLength(36)
  expect(cardsUrl.split('ids=')[1]!.split(',')).not.toContain(last.id)
  expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('view=dimensions'), expect.anything())
  expect(host.textContent).toContain('1080 × 1080 · 1080 × 1920')
  expect(toolMounted).not.toHaveBeenCalled()

  host.querySelector<HTMLButtonElement>('[data-duplicate]')!.click()
  for (let i = 0; i < 10; i++) await Vue.nextTick()
  expect(fetch).toHaveBeenCalledWith('/api/agency/banner-studio/projects/project')
  expect(fetch).toHaveBeenCalledWith('/api/agency/banner-studio/projects', expect.objectContaining({
    method: 'POST', headers: { 'Idempotency-Key': expect.any(String) },
    body: { name: 'Summer sale (copy)', clientId: 'client', folderId: null, canvasData: artwork, status: 'draft' }
  }))

  const search = host.querySelector<HTMLInputElement>('input[placeholder="Name, client, tag or dimensions"]')!
  search.value = '314'
  search.dispatchEvent(new Event('input'))
  await vi.waitFor(() => expect(host.textContent).toContain('314 × 271'))
  expect(fetch).toHaveBeenCalledWith(`/api/agency/banner-studio/projects?view=cards&ids=${last.id}`, expect.anything())

  const importButton = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Import creative packages'))!
  importButton.click()
  await Vue.nextTick()
  expect(toolMounted).toHaveBeenCalledTimes(1)
  closeImport()
  await Vue.nextTick()
  importButton.click()
  await Vue.nextTick()
  expect(toolMounted).toHaveBeenCalledTimes(1)
})
