// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import DissectorModal from '../../app/components/banner/DissectorModal.client.vue'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('Dissector incomplete results', () => {
  it('shows reconstruction findings and disables both import actions', async () => {
    vi.useFakeTimers()
    const manifest = {
      jobId: 'job', version: '2.0', status: 'review_ready', banner_size: '300x250', brand: 'Test', campaign_type: 'fixture',
      warnings: ['The background still needs clean reconstruction.'],
      tokens: { greeting: { value: 'Welcome home', label: 'Heading' } },
      layers: [{ id: 'background', type: 'background', description: 'Background', extraction_status: 'unresolved', extraction_warning: 'No clean background is available.', region: { x: 0, y: 0, width: 1, height: 1 } }]
    }
    const fetcher = vi.fn(async (url: string) => url.endsWith('/history')
      ? { dissections: [] }
      : url.endsWith('/upload') ? { jobId: 'job', status: 'queued' } : manifest)
    const state = reactive({ activeKey: 'mrec' })
    for (const [key, value] of Object.entries({ computed, ref, watch, onUnmounted, $fetch: fetcher, useBannerStudio: () => ({ state, nextId: () => 1, getCanvasData: () => ({}) }), useToast: () => ({ add: vi.fn() }) })) vi.stubGlobal(key, value)
    const host = document.createElement('div')
    const app = createApp(DissectorModal, { open: true })
    app.component('UModal', defineComponent({ setup: (_props, { slots }) => () => h('main', slots.content?.()) }))
    app.component('UFileUpload', defineComponent({ emits: ['update:modelValue'], setup: (_props, { emit }) => () => h('button', { onClick: () => emit('update:modelValue', new File(['fixture'], 'banner.png', { type: 'image/png' })) }, 'Choose fixture') }))
    app.component('UButton', defineComponent({ props: ['label', 'disabled'], setup: (props, { attrs }) => () => h('button', { ...attrs, disabled: props.disabled }, props.label) }))
    app.component('UAlert', defineComponent({ props: ['title', 'description'], setup: props => () => h('aside', [props.title, props.description]) }))
    app.component('UTextarea', defineComponent({ props: ['modelValue', 'readonly'], setup: props => () => h('textarea', { value: props.modelValue, readonly: props.readonly }) }))
    for (const name of ['UFormField', 'UInput', 'USelectMenu', 'UIcon', 'UBadge']) app.component(name, defineComponent({ setup: (_props, { slots }) => () => h('div', slots.default?.()) }))
    const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent === name)!
    try {
      app.mount(host)
      await nextTick()
      await nextTick()
      button('Choose fixture').click()
      await nextTick()
      button('Analyze').click()
      await vi.advanceTimersByTimeAsync(2001)
      await nextTick()
      expect(host.textContent).toContain('Needs reconstruction before import')
      expect(host.textContent).toContain(manifest.warnings[0])
      expect(button('New Project').disabled).toBe(true)
      expect(button('Import to Editor').disabled).toBe(true)
      expect(host.querySelector('textarea')?.readOnly).toBe(true)
      expect(fetcher).toHaveBeenCalledTimes(3)
    } finally { app.unmount() }
  })
})
