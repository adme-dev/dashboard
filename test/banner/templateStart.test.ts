// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, reactive, ref, watch, type Component } from 'vue'
import { BANNER_CATALOG_PRESETS, buildPresetCanvas } from '../../app/utils/banner-format-catalog'
import { copyTemplateCanvas } from '../../app/utils/banner-template-start'

const api = vi.fn()
for (const [name, value] of Object.entries({ ref, computed, watch, $fetch: api })) vi.stubGlobal(name, value)
const { default: StartModal } = await import('../../app/components/banner/TemplateStartModal.client.vue')
const { default: SaveModal } = await import('../../app/components/banner/BannerSaveAsTemplate.vue')
const preset = BANNER_CATALOG_PRESETS.find(p => p.id === 'display-set')!
const template = { id: 'saved', name: 'Saved artwork', canvasData: buildPresetCanvas(preset) }

const stubs = {
  UModal: defineComponent({ props: ['open'], setup: (p, { slots }) => () => p.open ? h('section', [slots.body?.(), slots.footer?.()]) : null }),
  UFormField: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
  UInput: defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('input', { value: p.modelValue, disabled: p.disabled, onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) }) }),
  USelectMenu: defineComponent({ props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('select', { value: p.modelValue, disabled: p.disabled, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLSelectElement).value) }, p.items.map((o: { value: string, label: string }) => h('option', { value: o.value }, o.label))) }),
  UCheckbox: defineComponent({ props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('input', { 'type': 'checkbox', 'checked': p.modelValue, 'disabled': p.disabled, 'aria-label': p.label, 'onChange': (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked) }) }),
  UButton: defineComponent({ props: ['label', 'disabled', 'loading', 'to'], emits: ['click'], setup: (p, { emit }) => () => h('button', { 'disabled': p.disabled || p.loading, 'data-to': p.to, 'onClick': () => emit('click') }, p.label) }),
  UAlert: defineComponent({ props: ['title'], setup: p => () => h('p', p.title) }),
  UTextarea: true
}
async function flushPromises() {
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}
function mount(component: Component, options: { props: Record<string, unknown>, global: unknown }) {
  const props = reactive(options.props)
  const events: Record<string, unknown[][]> = {}
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(component, { ...props, onCreated: (...args: unknown[]) => {
    (events.created ||= []).push(args)
  } }) })
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub === true ? defineComponent({ render: () => h('textarea') }) : stub)
  app.mount(host)
  function wrap(element: Element) {
    return {
      text: () => element.textContent || '',
      attributes: (name: string) => element.getAttribute(name) ?? undefined,
      trigger: async (name: string) => {
        if (!(element as HTMLButtonElement).disabled) element.dispatchEvent(new Event(name, { bubbles: true }))
        await nextTick()
      },
      setValue: async (value: string | boolean) => {
        const input = element as HTMLInputElement
        if (typeof value === 'boolean') input.checked = value
        else input.value = value
        element.dispatchEvent(new Event(element.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', { bubbles: true }))
        await nextTick()
      }
    }
  }
  return {
    find: (selector: string) => wrap(host.querySelector(selector)!),
    findAll: (selector: string) => [...host.querySelectorAll(selector)].map(wrap),
    text: () => host.textContent || '',
    emitted: (name: string) => events[name],
    setProps: async (values: Record<string, unknown>) => {
      Object.assign(props, values)
      await nextTick()
    },
    unmount: () => {
      app.unmount()
      host.remove()
    }
  }
}
async function openModal(props: Record<string, unknown> = { preset }) {
  const wrapper = mount(StartModal, { props: { open: false, ...props }, global: { stubs } })
  await wrapper.setProps({ open: true })
  await flushPromises()
  return wrapper
}
function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)!
}
beforeEach(() => {
  api.mockReset().mockImplementation(async (url: string) => {
    if (url.endsWith('/clients')) return [{ id: 'client', name: 'Client' }]
    if (url.endsWith('/folders')) return [{ id: 'folder', name: 'Campaigns', parentId: null }]
    return { id: 'draft', name: 'New draft' }
  })
})

describe('template canvas copying', () => {
  it('preserves nested artwork, media and timing without linking subsequent edits to the source', () => {
    const source = buildPresetCanvas(preset, 'automotive')
    source.custom_200x200!.playback = { duration: 12, loopCount: 3 }
    const copy = copyTemplateCanvas(JSON.stringify(source))
    expect(copy).toEqual(source)
    copy.custom_200x200!.layers[0]!.bgColor = '#abcdef'
    copy.custom_200x200!.playback!.duration = 5
    expect(source.custom_200x200!.playback!.duration).toBe(12)
    expect(source.custom_200x200!.layers[0]!.bgColor).not.toBe('#abcdef')
    expect(Object.keys(copyTemplateCanvas(source, ['custom_200x200']))).toEqual(['custom_200x200'])
  })
  it('rejects missing, duplicate and unsupported layouts before dispatch', () => {
    expect(() => copyTemplateCanvas(null)).toThrow()
    expect(() => copyTemplateCanvas({}, [])).toThrow()
    expect(() => copyTemplateCanvas(template.canvasData, ['custom_200x200', 'custom_200x200'])).toThrow()
    expect(() => copyTemplateCanvas({ unknown: { layers: [] } })).toThrow()
    expect(() => copyTemplateCanvas({ custom_300x250: {} })).toThrow()
  })
})

describe('new design set modal', () => {
  it('creates a saved set with the chosen layouts, client and folder', async () => {
    const wrapper = await openModal()
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(23)
    await wrapper.find('input:not([type="checkbox"])').setValue('Dealer campaign')
    await wrapper.findAll('select')[0]!.setValue('client')
    await wrapper.findAll('select')[1]!.setValue('folder')
    await wrapper.find('input[type="checkbox"]').setValue(false)
    await button(wrapper, 'Create draft').trigger('click')
    await flushPromises()
    const options = api.mock.calls.find(([url]) => url.endsWith('/projects'))![1]
    expect(options.body).toMatchObject({ name: 'Dealer campaign', clientId: 'client', folderId: 'folder', tags: ['preset:display-set'] })
    expect(Object.keys(options.body.canvasData)).toHaveLength(22)
    expect(options.body.canvasData.custom_200x200).toBeUndefined()
    expect(wrapper.emitted('created')?.[0]?.[0]).toMatchObject({ id: 'draft' })
    wrapper.unmount()
  })
  it('copies all saved template layouts and only increments usage after creating the project', async () => {
    const wrapper = await openModal({ template })
    await button(wrapper, 'Create draft').trigger('click')
    await flushPromises()
    const calls = api.mock.calls.filter(([url]) => url.endsWith('/projects') || url.endsWith('/use'))
    expect(calls.map(c => c[0])).toEqual(['/api/agency/banner-studio/projects', '/api/agency/banner-studio/templates/saved/use'])
    expect(calls[0]![1].body.canvasData).toEqual(template.canvasData)
    expect(calls[0]![1].body.canvasData).not.toBe(template.canvasData)
    wrapper.unmount()
  })
  it('prevents a second dispatch while saving and requires checking drafts after a transport failure', async () => {
    let reject!: (reason: unknown) => void
    api.mockImplementation(async (url: string) => url.endsWith('/projects')
      ? new Promise((_resolve, fail) => {
          reject = fail
        })
      : [])
    const wrapper = await openModal()
    await button(wrapper, 'Create draft').trigger('click')
    await button(wrapper, 'Create draft').trigger('click')
    expect(api.mock.calls.filter(([url]) => url.endsWith('/projects'))).toHaveLength(1)
    reject(new TypeError('Connection reset'))
    await flushPromises()
    expect(wrapper.text()).toContain('Check your drafts')
    expect(button(wrapper, 'Create draft')).toBeUndefined()
    expect(button(wrapper, 'View drafts').attributes('data-to')).toBe('/agency/banner-studio')
    wrapper.unmount()
  })
  it('keeps validation errors recoverable without treating them as dispatched writes', async () => {
    const wrapper = await openModal({ template: { ...template, canvasData: { custom_300x250: { invalid: true } } } })
    await button(wrapper, 'Create draft').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('unsupported layout')
    expect(api.mock.calls.some(([url]) => url.endsWith('/projects'))).toBe(false)
    expect(button(wrapper, 'Create draft').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
  it('blocks creation when folder/client choices fail to load', async () => {
    api.mockRejectedValue(new Error('Load failed'))
    const wrapper = await openModal()
    expect(button(wrapper, 'Create draft').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

describe('saving a reusable design set', () => {
  it('waits for all current artwork to save before requesting a template snapshot', async () => {
    let finish!: () => void
    const saveProject = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    vi.stubGlobal('useBannerStudio', () => ({ state: { project: { id: 'project' }, setKeys: ['one', 'two'], isDirty: false }, saveProject }))
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    const wrapper = mount(SaveModal, { props: { open: true }, global: { stubs } })
    await wrapper.find('input').setValue('Two sizes')
    await button(wrapper, 'Save template').trigger('click')
    expect(saveProject).toHaveBeenCalledTimes(1)
    expect(api).not.toHaveBeenCalled()
    finish()
    await nextTick()
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/api/agency/banner-studio/templates/from-project', expect.objectContaining({ body: expect.objectContaining({ projectId: 'project', name: 'Two sizes' }) }))
    wrapper.unmount()
  })
})
