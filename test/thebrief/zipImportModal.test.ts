// @vitest-environment happy-dom
import { createHash } from 'node:crypto'
import { strToU8, zipSync } from 'fflate'
import { computed, createApp, defineComponent, h, nextTick, reactive, ref, shallowRef, toRaw, watch } from 'vue'
import { expect, it, vi } from 'vitest'
import { prepareTheBriefGroup } from '../../scripts/thebrief/prepare-group.mjs'
import { source } from './fixture'

it('assigns and imports a whole ZIP, skips an existing parent, and retains saved rows on reselection', async () => {
  const clientId = '11111111-1111-4111-8111-111111111111'
  const entries = Object.fromEntries(['Sale', 'Traffic', 'Tonale'].flatMap(name => [300, 600].map(width => [`${name}-${width}x250-px.zip`, zipSync({ 'index.html': strToU8(source.replace('designData:{', `designData:{designHash:"${name}${width}",`).replaceAll('width:300', `width:${width}`)) })])))
  const archive = zipSync(entries)
  const selected = new File([archive], 'Designs-HTML.zip')
  const prepared = await prepareTheBriefGroup(archive, selected.name)
  const sha = (value: string) => createHash('sha256').update(value).digest('hex')
  const traffic = prepared.packages.find(pkg => pkg.name === 'Traffic')!
  const oldHash = sha(`legacy-parent\n${traffic.source.sizeSources.map(item => item.sha256).sort().join('\n')}\n`)
  const projects = [{ id: 'existing-traffic', clientId, folderId: 'folder', status: 'draft', name: 'Traffic', canvasData: traffic.canvasData, tags: ['source:thebrief', 'source-design:legacy-parent', `source-sha256:${oldHash}`] }]
  const api = vi.fn(async (url: string, options?: { method?: string, body?: Record<string, unknown> }) => {
    if (url.endsWith('/clients')) return [{ id: clientId, name: 'Aspley Alfa Romeo' }]
    if (url.endsWith('/folders')) return [{ id: 'folder', name: 'Alfa Romeo', parentId: null, position: 0 }]
    if (url.endsWith('/import/prepare')) return prepared
    if (url.endsWith('/projects')) {
      if (options?.method !== 'POST') return structuredClone(projects)
      const project = { ...options.body, id: `draft-${projects.length}`, status: 'draft' }
      projects.push(project as never)
      return project
    }
    const id = url.split('/projects/')[1]?.split('/')[0]
    if (url.endsWith('/snapshot')) return options?.method === 'POST' ? { revision: id } : { projectId: id, revision: id }
    return structuredClone(projects.find(project => project.id === id))
  })
  for (const [name, value] of Object.entries({ ref, shallowRef, computed, watch, toRaw, $fetch: api })) vi.stubGlobal(name, value)
  vi.stubGlobal('useAuth', () => ({ canWrite: ref(true) }))
  vi.stubGlobal('useBannerFonts', () => ({ refreshCustomFonts: vi.fn(async () => []), uploadCustomFont: vi.fn() }))
  const container = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
  const stubs = {
    UModal: defineComponent({ props: ['open'], setup: (props, { slots }) => () => props.open ? h('section', [slots.body?.(), slots.footer?.()]) : null }),
    UFormField: container, UBadge: container, UPopover: container, UCalendar: container,
    UCollapsible: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.({ open: false })) }),
    UAlert: defineComponent({ props: ['title', 'description'], setup: (props, { slots }) => () => h('div', [props.title, props.description, slots.actions?.()]) }),
    UFileUpload: defineComponent({ props: ['disabled'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('button', { disabled: props.disabled, onClick: () => emit('update:modelValue', [selected]) }, 'Choose ZIP') }),
    UCheckbox: defineComponent({ props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('button', { disabled: props.disabled, onClick: () => emit('update:modelValue', !props.modelValue) }, props.label) }),
    USelectMenu: defineComponent({ props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], setup: (props, { emit }) => () => h('select', { disabled: props.disabled, value: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value) }, props.items.map((item: { value: string, label: string }) => h('option', { value: item.value }, item.label))) }),
    UButton: defineComponent({ props: ['label', 'disabled'], emits: ['click'], setup: (props, { slots, emit }) => () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, props.label || slots.default?.()) })
  }
  const { default: Modal } = await import('../../app/components/banner/TheBriefImportModal.client.vue')
  const props = reactive({ open: false })
  const app = createApp({ render: () => h(Modal, props) })
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub)
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  const click = async (name: string) => {
    const button = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === name)!
    expect(button).toBeDefined()
    expect(button.disabled).toBe(false)
    button.click()
    await nextTick()
  }
  try {
    props.open = true
    await vi.waitFor(() => expect(api).toHaveBeenCalledWith('/api/agency/banner-studio/folders'))
    await nextTick()
    await click('Choose ZIP')
    await vi.waitFor(() => expect(host.querySelectorAll('section section')).toHaveLength(3))
    const controls = host.querySelectorAll('select')
    controls[0]!.value = clientId
    controls[0]!.dispatchEvent(new Event('change'))
    controls[1]!.value = 'folder'
    controls[1]!.dispatchEvent(new Event('change'))
    await nextTick()
    await click('Apply to unimported designs')
    await click('Import undated drafts and backfill the date later')
    await click('Import assigned drafts')
    await vi.waitFor(() => expect(host.textContent?.match(/saved viewer ready/g)).toHaveLength(2))
    expect(projects).toHaveLength(3)
    expect(projects.slice(1).every(project => project.clientId === clientId && project.folderId === 'folder')).toBe(true)
    expect(host.textContent).toContain('Already imported from this TheBrief design')
    await click('Choose ZIP')
    await vi.waitFor(() => expect(host.querySelectorAll('section section')).toHaveLength(3))
    expect(api.mock.calls.filter(([url]) => url.endsWith('/import/prepare'))).toHaveLength(1)
    expect(api.mock.calls.filter(([url, options]) => url.endsWith('/projects') && options?.method === 'POST')).toHaveLength(2)
    expect(host.textContent?.match(/saved viewer ready/g)).toHaveLength(2)
  } finally {
    app.unmount()
    host.remove()
    vi.unstubAllGlobals()
    localStorage.clear()
  }
}, 30000)
