// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import MediaGenerateComposer from '~~/app/components/media/MediaGenerateComposer.vue'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
})

describe('MediaGenerateComposer external model selection', () => {
  it('reapplies the same requested model after a manual change without submitting generation', async () => {
    const base = getVideoGenerationModel('aigateway/seedance-i2v')!
    const models = [
      { ...base, id: 'fixture/model-a', label: 'Model A' },
      { ...base, id: 'fixture/model-b', label: 'Model B' }
    ]
    const api = vi.fn(async (url: string, options?: { method?: string }) => {
      if (url !== '/api/agency/video/generation/models' || (options?.method && options.method !== 'GET')) {
        throw new Error(`Unexpected request: ${url}`)
      }
      return { models }
    })
    vi.stubGlobal('$fetch', api)
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    const props = reactive({
      active: true,
      projectId: 'project-selection-test',
      timelineStills: [],
      defaultAspect: '16:9',
      initialModelId: 'fixture/model-a',
      modelSelectionKey: 1
    })
    const submitted = vi.fn()
    app = createApp({ render: () => h(MediaGenerateComposer, { ...props, onSubmitted: submitted }) })
    const slotStub = { template: '<div><slot /></div>' }
    for (const name of ['UAlert', 'USkeleton', 'UIcon', 'UTextarea', 'UPopover', 'UFormField', 'UBadge', 'UTooltip']) {
      app.component(name, slotStub)
    }
    app.component('UButton', { props: ['label', 'disabled'], template: '<button :disabled="disabled"><slot />{{ label }}</button>' })
    const selectStub = {
      props: ['modelValue', 'items'],
      emits: ['update:modelValue'],
      template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>`
    }
    app.component('USelect', selectStub)
    app.component('USelectMenu', selectStub)
    const host = document.createElement('div')
    app.mount(host)
    await Promise.resolve()
    await nextTick()

    const picker = host.querySelector<HTMLSelectElement>('select[aria-label="Model"]')!
    expect(picker).not.toBeNull()
    expect(picker.value).toBe('fixture/model-a')
    picker.value = 'fixture/model-b'
    picker.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(picker.value).toBe('fixture/model-b')

    // Selecting A again leaves initialModelId unchanged; the command key must
    // still override the user's intervening local selection of B.
    props.modelSelectionKey++
    await nextTick()
    expect(picker.value).toBe('fixture/model-a')
    expect(api.mock.calls).toEqual([
      ['/api/agency/video/generation/models', { query: { projectId: 'project-selection-test' } }]
    ])
    expect(submitted).not.toHaveBeenCalled()
  })
})
