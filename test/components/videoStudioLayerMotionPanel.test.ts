// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { LAYER_COMPOSITION_TAG, buildLayerComposition } from '~~/app/utils/video/layerAnimation'

const loadComposition = vi.fn()
const setLayerPreset = vi.fn()
const generateLayerMotion = vi.fn()
vi.mock('~~/app/composables/useLayerAnimation', () => ({
  isLayerComposition: (project: { tags?: string[] } | null) => Boolean(project?.tags?.includes('video-studio:animated-layers')),
  useLayerAnimation: () => ({ loadComposition, setLayerPreset, generateLayerMotion })
}))
const toastAdd = vi.fn()
vi.stubGlobal('useToast', () => ({ add: toastAdd }))

const VideoStudioLayerMotionPanel = (await import('~~/app/components/media/VideoStudioLayerMotionPanel.vue')).default

const stubs = {
  UIcon: { name: 'UIcon', template: '<i />' },
  UButton: { name: 'UButton', props: ['label', 'disabled', 'to'], emits: ['click'], template: '<button :disabled="disabled" :data-to="to" @click="$emit(\'click\', $event)">{{ label }}</button>' },
  USelect: {
    name: 'USelect',
    props: ['modelValue', 'items', 'ariaLabel', 'disabled'],
    emits: ['update:modelValue'],
    template: '<select :aria-label="ariaLabel" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', isNaN(Number($event.target.value)) ? $event.target.value : Number($event.target.value))"><option v-for="item in items || []" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  USwitch: { name: 'USwitch', props: ['modelValue', 'label', 'description', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" data-motion-switch :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}<small>{{ description }}</small></label>' },
  UModal: { name: 'UModal', props: ['open', 'title', 'description'], template: '<section v-if="open" data-confirm><h2>{{ title }}</h2><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { name: 'UFormField', props: ['label', 'help'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UTextarea: { name: 'UTextarea', props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UAlert: { name: 'UAlert', props: ['title', 'description'], template: '<div data-cost>{{ title }} {{ description }}</div>' }
}

const frame = { width: 1080, height: 1920 }
function composition(tags = [LAYER_COMPOSITION_TAG]) {
  const built = buildLayerComposition({
    source: { width: 1152, height: 2048 },
    frame,
    layers: [
      { src: '/a/base.png', name: 'Background', kind: 'background', role: 'base', bbox: { x: 0, y: 0, width: 1152, height: 2048 } },
      { src: '/a/car.png', name: 'car', kind: 'product', role: 'layer', bbox: { x: 147, y: 952, width: 830, height: 430 } },
      { src: '/a/price.png', name: 'price badge', kind: 'badge', role: 'layer', bbox: { x: 784, y: 725, width: 301, height: 299 } }
    ]
  })
  return { id: 'banner-1', name: 'Layers', clientId: null, tags, canvasData: built.canvasData }
}

const motionModel = { label: 'Seedance (image-to-video)', centsPerSecond: 12, durationsSeconds: [5, 10] }

async function mount(props: Record<string, unknown> = {}) {
  const events: Array<{ name: string, payload?: unknown }> = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioLayerMotionPanel, {
      videoProjectId: 'video-1', bannerProjectId: 'banner-1', formatKey: 'custom_1080x1920', frame, motionModel,
      ...props,
      onChanged: (payload: unknown) => events.push({ name: 'changed', payload }),
      onGenerated: () => events.push({ name: 'generated' })
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  await nextTick()
  return { app, host, events }
}

const buttons = (host: HTMLElement, text: string) => [...host.querySelectorAll('button')].filter(button => button.textContent?.includes(text))

describe('VideoStudioLayerMotionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadComposition.mockResolvedValue(composition())
  })

  it('shows nothing for an ordinary banner overlay', async () => {
    loadComposition.mockResolvedValue(composition([]))
    const { app, host } = await mount()
    try {
      expect(host.querySelector('[data-layer-motion-panel]')).toBeNull()
    } finally {
      app.unmount()
    }
  })

  it('lists the layers top first with their current move and links to the keyframe editor', async () => {
    const { app, host } = await mount()
    try {
      const selects = [...host.querySelectorAll('select')] as HTMLSelectElement[]
      expect(selects.map(el => [el.getAttribute('aria-label'), el.value])).toEqual([
        ['Motion for price badge', 'pop'], ['Motion for car', 'push-in'], ['Motion for Background', 'bg-zoom']
      ])
      expect(buttons(host, 'Edit keyframes')[0]!.dataset.to).toBe('/agency/banner-studio/banner-1')
    } finally {
      app.unmount()
    }
  })

  it('saves a new move for one layer and tells the preview to reload', async () => {
    const saved = composition()
    setLayerPreset.mockResolvedValue(saved)
    const { app, host, events } = await mount()
    try {
      const car = host.querySelector('select[aria-label="Motion for car"]') as HTMLSelectElement
      car.value = 'slide-side'
      car.dispatchEvent(new Event('change'))
      await nextTick()
      await nextTick()
      expect(setLayerPreset).toHaveBeenCalledWith(expect.objectContaining({ id: 'banner-1' }), 'custom_1080x1920', 2, 'slide-side', frame)
      expect(events).toContainEqual({ name: 'changed', payload: 'banner-1' })
    } finally {
      app.unmount()
    }
  })

  it('keeps generated motion off until it is switched on, and never offers it for the background', async () => {
    const { app, host } = await mount()
    try {
      expect((host.querySelector('[data-motion-switch]') as HTMLInputElement).checked).toBe(false)
      expect(buttons(host, 'Generate motion')).toHaveLength(0)
      const toggle = host.querySelector('[data-motion-switch]') as HTMLInputElement
      toggle.checked = true
      toggle.dispatchEvent(new Event('change'))
      await nextTick()
      // The car and the badge, but not the background.
      expect(buttons(host, 'Generate motion')).toHaveLength(2)
    } finally {
      app.unmount()
    }
  })

  it('shows the cost and waits for confirmation before anything is generated', async () => {
    generateLayerMotion.mockResolvedValue({ project: composition(), job: { id: 'job-1' } })
    const { app, host, events } = await mount()
    try {
      const toggle = host.querySelector('[data-motion-switch]') as HTMLInputElement
      toggle.checked = true
      toggle.dispatchEvent(new Event('change'))
      await nextTick()
      // Rows are top first: the badge, then the car.
      buttons(host, 'Generate motion')[1]!.click()
      await nextTick()
      expect(generateLayerMotion).not.toHaveBeenCalled()
      expect(host.querySelector('[data-confirm] h2')!.textContent).toBe('Generate motion for car')
      expect(host.querySelector('[data-cost]')!.textContent).toContain('This costs about US$0.60')
      expect(buttons(host, 'Generate for US$0.60')).toHaveLength(1)

      // A longer clip costs more, and the button says so before it is pressed.
      const length = [...host.querySelectorAll('[data-confirm] select')][0] as HTMLSelectElement
      length.value = '10'
      length.dispatchEvent(new Event('change'))
      await nextTick()
      expect(buttons(host, 'Generate for US$1.20')).toHaveLength(1)

      buttons(host, 'Generate for US$1.20')[0]!.click()
      await nextTick()
      await nextTick()
      expect(generateLayerMotion).toHaveBeenCalledTimes(1)
      expect(generateLayerMotion.mock.calls[0]![0]).toMatchObject({ videoProjectId: 'video-1', bannerProjectId: 'banner-1', formatKey: 'custom_1080x1920', layerId: 2, durationSeconds: 10 })
      expect(generateLayerMotion.mock.calls[0]![0].prompt).toContain('Locked-off camera')
      expect(events.map(event => event.name)).toEqual(expect.arrayContaining(['changed', 'generated']))
    } finally {
      app.unmount()
    }
  })

  it('cancelling the confirmation spends nothing', async () => {
    const { app, host } = await mount()
    try {
      const toggle = host.querySelector('[data-motion-switch]') as HTMLInputElement
      toggle.checked = true
      toggle.dispatchEvent(new Event('change'))
      await nextTick()
      buttons(host, 'Generate motion')[0]!.click()
      await nextTick()
      buttons(host, 'Cancel')[0]!.click()
      await nextTick()
      expect(host.querySelector('[data-confirm]')).toBeNull()
      expect(generateLayerMotion).not.toHaveBeenCalled()
    } finally {
      app.unmount()
    }
  })

  it('cannot be switched on when the project has no access to the model, and says why', async () => {
    const { app, host } = await mount({ motionModel: null, motionUnavailableReason: 'Not available: AI clip generation is switched off for this workspace.' })
    try {
      expect((host.querySelector('[data-motion-switch]') as HTMLInputElement).disabled).toBe(true)
      expect(host.textContent).toContain('AI clip generation is switched off for this workspace.')
    } finally {
      app.unmount()
    }
  })
})
