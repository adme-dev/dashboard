// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, type App } from 'vue'
import type { MediaProject } from '~~/app/types'
import VideoStudioProjectGallery from '~~/app/components/media/VideoStudioProjectGallery.vue'

type Project = MediaProject & { cover?: { url: string, kind: 'image' | 'video', label?: string } | null }
const apps: App[] = []
const api = vi.fn()
const stubs = {
  UButton: {
    props: ['label', 'disabled', 'loading'], emits: ['click'],
    template: '<button :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UFormField: { props: ['label'], template: '<div :data-field="label"><span>{{ label }}</span><slot /></div>' },
  UInput: {
    props: ['modelValue'], emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelect: {
    props: ['modelValue', 'items'], emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  UDropdownMenu: {
    props: ['items'],
    template: '<div><slot /><button v-for="item in items.flat()" :key="item.label" :disabled="item.disabled" @click="item.onSelect()">{{ item.label }}</button></div>'
  },
  UAlert: { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}<slot name="actions" /></div>' },
  UBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
  UIcon: { template: '<i />' },
  USkeleton: { template: '<div data-skeleton />' }
}

const project = (id: string, overrides: Partial<Project> = {}): Project => ({
  id, title: `Project ${id}`, clientId: null, createdBy: 'actor', mediaType: 'av', status: 'draft',
  currentTimelineId: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-05T00:00:00Z', ...overrides
})

async function mount(initial: { projects: Project[], [key: string]: unknown }) {
  const state = reactive({ view: 'grid' as 'grid' | 'list', ...initial })
  const events: Array<{ name: string, value?: unknown }> = []
  const host = document.createElement('div')
  const app = createApp({ render: () => h(VideoStudioProjectGallery, {
    ...state,
    'onOpen': (value: Project) => events.push({ name: 'open', value }),
    'onDuplicate': (value: Project) => events.push({ name: 'duplicate', value }),
    'onDelete': (value: Project) => events.push({ name: 'delete', value }),
    'onCreate': () => events.push({ name: 'create' }),
    'onRetry': () => events.push({ name: 'retry' }),
    'onUpdate:view': (value: string) => events.push({ name: 'view', value })
  }) })
  for (const [name, component] of Object.entries(stubs)) app.component(name, component)
  apps.push(app)
  app.mount(host)
  await nextTick()
  return { host, state, events }
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}

async function setField(host: HTMLElement, field: string, value: string) {
  const control = host.querySelector(`[data-field="${field}"] input, [data-field="${field}"] select`) as HTMLInputElement | HTMLSelectElement
  if (!control) throw new Error(`Missing field: ${field}`)
  control.value = value
  control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  await nextTick()
}

beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('$fetch', api)
  api.mockReset()
})
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  vi.unstubAllGlobals()
})

describe('VideoStudioProjectGallery', () => {
  it('uses only the supplied real cover and keeps missing covers honest', async () => {
    const { host } = await mount({ projects: [
      project('covered', { cover: { url: '/api/agency/video/assets/real/thumbnail', kind: 'image', label: 'Saved project still' } }),
      project('empty')
    ] })
    expect(host.querySelectorAll('img')).toHaveLength(1)
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/api/agency/video/assets/real/thumbnail')
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('Saved project still')
    expect(host.querySelectorAll('article')[1]?.textContent).toContain('No preview yet')
    expect(host.querySelectorAll('article')[1]?.querySelector('img, video')).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it('replaces a failed cover with an empty state and allows a genuinely new cover URL', async () => {
    const { host, state } = await mount({ projects: [project('one', { cover: { url: '/real/old', kind: 'image' } })] })
    host.querySelector('img')!.dispatchEvent(new Event('error'))
    await nextTick()
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toContain('No preview yet')
    state.projects = [project('one', { cover: { url: '/real/replacement', kind: 'image' } })]
    await nextTick()
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/real/replacement')
    expect(api).not.toHaveBeenCalled()
  })

  it('never autoplays a supplied video preview', async () => {
    const { host } = await mount({ projects: [project('video', { cover: { url: '/real/preview.mp4', kind: 'video' } })] })
    const video = host.querySelector('video')!
    expect(video.getAttribute('src')).toBe('/real/preview.mp4')
    expect(video.getAttribute('preload')).toBe('metadata')
    expect(video.hasAttribute('autoplay')).toBe(false)
    video.dispatchEvent(new Event('error'))
    await nextTick()
    expect(host.querySelector('video')).toBeNull()
    expect(host.textContent).toContain('No preview yet')
  })

  it('combines title/client search with status and client filters and can clear them', async () => {
    const { host } = await mount({ projects: [
      project('agency', { title: 'Agency launch' }),
      project('approved', { title: 'Autumn launch', clientId: 'client-a', status: 'approved' }),
      project('draft', { title: 'Autumn draft', clientId: 'client-a' })
    ], clients: [{ id: 'client-a', name: 'Northwall' }] })
    await setField(host, 'Search projects', 'NORTHWALL')
    expect(host.querySelectorAll('article')).toHaveLength(2)
    await setField(host, 'Status', 'approved')
    expect(host.querySelectorAll('article')).toHaveLength(1)
    expect(host.querySelector('article')?.textContent).toContain('Autumn launch')
    await setField(host, 'Client', 'agency')
    expect(host.querySelectorAll('article')).toHaveLength(0)
    expect(host.textContent).toContain('No matching projects')
    button(host, 'Clear filters').click()
    await nextTick()
    expect(host.querySelectorAll('article')).toHaveLength(3)
    await setField(host, 'Search projects', 'agency launch')
    expect(host.querySelectorAll('article')).toHaveLength(1)
    expect(host.querySelector('article')?.textContent).toContain('Agency launch')
  })

  it('emits the requested layout and renders the same projects when the parent applies it', async () => {
    const { host, state, events } = await mount({ projects: [project('one')] })
    button(host, 'List').click()
    expect(events).toEqual([{ name: 'view', value: 'list' }])
    state.view = 'list'
    await nextTick()
    expect(button(host, 'List').getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('article')?.classList.contains('sm:flex-row')).toBe(true)
    expect(host.querySelectorAll('article')).toHaveLength(1)
    button(host, 'Gallery').click()
    expect(events.at(-1)).toEqual({ name: 'view', value: 'grid' })
  })

  it('emits project actions without mutating projects or submitting requests', async () => {
    const source = project('one')
    const before = JSON.stringify(source)
    const { host, events } = await mount({ projects: [source] })
    button(host, 'Open project').click()
    button(host, 'Duplicate project').click()
    button(host, 'Delete project').click()
    expect(events).toEqual(['open', 'duplicate', 'delete'].map(name => ({ name, value: source })))
    expect(JSON.stringify(source)).toBe(before)
    expect(api).not.toHaveBeenCalled()
  })

  it('distinguishes loading, failure and a truly empty project collection', async () => {
    const { host, state, events } = await mount({ projects: [], pending: true, error: null as string | null })
    expect(host.querySelector('[data-skeleton]')).not.toBeNull()
    expect(host.textContent).not.toContain('Create your first video')
    Object.assign(state, { pending: false, error: 'Could not reach the server' })
    await nextTick()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Projects could not be loaded')
    button(host, 'Try again').click()
    expect(events).toEqual([{ name: 'retry' }])
    state.error = null
    await nextTick()
    expect(host.textContent).toContain('Create your first video')
    button(host, 'New video project').click()
    expect(events.at(-1)).toEqual({ name: 'create' })
    expect(api).not.toHaveBeenCalled()
  })
})
