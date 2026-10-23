// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import ButtonInspector from '../../app/components/banner/inspector/Button.vue'
import TextInspector from '../../app/components/banner/inspector/Text.vue'

afterEach(() => vi.unstubAllGlobals())

describe('editable imported font weights', () => {
  it.each([ButtonInspector, TextInspector])('keeps the exact weight visible as the catalog and selected layer change', async (component) => {
    const selectedLayer = ref({ id: 1, type: 'text', text: 'Brand', fontFamily: 'Imported Brand', fontWeight: 325 })
    const available = ref<number[]>()
    const updateLayer = vi.fn((_id, change) => Object.assign(selectedLayer.value, change))
    for (const [name, value] of Object.entries({
      computed, ref, onMounted, $fetch: vi.fn(), useToast: () => ({ add: vi.fn() }),
      useBannerStudio: () => ({ state: {}, selectedLayer, updateLayer }),
      useBannerFonts: () => ({
        getFont: () => ({ weights: available.value }), fetchCustomFonts: async () => {},
        searchFonts: () => [], recentFonts: ref([]), customFonts: ref([]), loadFont: vi.fn(), isCustomFont: () => true
      })
    })) vi.stubGlobal(name, value)
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(component)
    app.component('UFormField', defineComponent({ props: ['label'], setup: (props, { slots }) => () => h('section', { 'data-label': props.label }, slots.default?.()) }))
    app.component('USelectMenu', defineComponent({
      props: ['modelValue', 'items'], emits: ['update:modelValue'],
      setup: (props, { emit }) => () => h('div', { 'data-selected': props.modelValue }, props.items.map((item: { value: string, label: string }) => h('button', { 'data-weight': item.value, 'onClick': () => emit('update:modelValue', item.value) }, item.label)))
    }))
    for (const name of ['UInput', 'UPopover', 'UButton', 'UIcon', 'UBadge', 'UCheckbox']) app.component(name, defineComponent({ setup: (_props, { slots }) => () => h('div', slots.default?.()) }))
    try {
      app.mount(host)
      const field = () => host.querySelector('[data-label="Weight"]')!
      expect(field().querySelector('[data-selected="325"]')).not.toBeNull()
      expect(field().querySelector('[data-weight="325"]')?.textContent).toBe('325')
      available.value = [325, 700]
      selectedLayer.value = { ...selectedLayer.value, id: 2, fontWeight: 700 }
      await nextTick()
      expect(field().querySelector('[data-selected="700"]')).not.toBeNull()
      ;(field().querySelector('[data-weight="325"]') as HTMLElement).click()
      await nextTick()
      expect(updateLayer).toHaveBeenLastCalledWith(2, { fontWeight: 325 })
      expect(field().querySelector('[data-selected="325"]')).not.toBeNull()
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
