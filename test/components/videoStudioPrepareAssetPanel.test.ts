// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioPrepareAssetPanel from '~~/app/components/media/VideoStudioPrepareAssetPanel.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UButton: {
    name: 'UButton',
    props: ['label', 'disabled', 'ariaLabel'],
    emits: ['click'],
    template: '<button :disabled="disabled" :aria-label="ariaLabel" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UFormField: { name: 'UFormField', props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UInput: { name: 'UInput', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<input :value="modelValue" :placeholder="placeholder" />' },
  USelect: { name: 'USelect', props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue"><option v-for="item in items || []" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  UTextarea: { name: 'UTextarea', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :placeholder="placeholder" />' },
  USlider: { name: 'USlider', props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="range" :value="modelValue" />' },
  USkeleton: { name: 'USkeleton', template: '<div />' },
  UTooltip: { name: 'UTooltip', template: '<span><slot /></span>' },
}

const baseProps = {
  selectedItemTitle: 'Hero vehicle',
  selectedItemAssetId: 'asset-1',
  actionOptions: [{ label: 'Lift highlighted area', value: 'mask-lift' }],
  selectedAction: 'mask-lift',
  toolPrompt: 'Lift the badge',
  runningExtraction: false,
  maskToolEnabled: true,
  selectedAssetThumbnailUrl: null,
  hasMaskStroke: true,
  brushMaskKey: 'video-asset-masks/project/asset/mask.png',
  uploadingMask: false,
  brushSize: 24,
  maskPreviewUrl: '/mask-preview.png',
  selectedActionModels: [{ id: 'replicate/sam-2', displayName: 'SAM 2 segmentation', defaultEnabled: true }],
  selectedAssetActivityVisible: true,
  selectedDirectivePrompt: 'Existing directive',
  selectedItemJobs: [{ id: 'job-1', action: 'mask-lift', modelId: 'replicate/sam-2', status: 'succeeded' }],
  selectedDerivatives: [{ id: 'derivative-1', kind: 'mask-png', r2Key: 'derivatives/mask.png', metadata: { title: 'Clean mask' } }],
  loadingDerivatives: false,
  addingDerivativeId: null,
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VideoStudioPrepareAssetPanel, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(props: Record<string, unknown>) {
  const events: Array<{ name: string, payload?: unknown }> = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioPrepareAssetPanel, {
      ...props,
      onRun: () => events.push({ name: 'run' }),
      onClearMask: () => events.push({ name: 'clear-mask' }),
      onUploadMask: () => events.push({ name: 'upload-mask' }),
      onAddDerivativeToTimeline: (value: unknown) => events.push({ name: 'add-derivative-to-timeline', payload: value }),
      onAddDerivativeToBucket: (value: unknown) => events.push({ name: 'add-derivative-to-bucket', payload: value }),
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host, events }
}

describe('VideoStudioPrepareAssetPanel', () => {
  it('renders prepare controls, mask canvas, models, jobs, and derivatives', async () => {
    const html = await render(baseProps)

    expect(html).toContain('Prepare asset')
    expect(html).toContain('Hero vehicle')
    expect(html).toContain('Lift highlighted area')
    expect(html).toContain('Lift the badge')
    expect(html).toContain('Highlighter mask')
    expect(html).toContain('video-asset-masks/project/asset/mask.png')
    expect(html).toContain('Available models')
    expect(html).toContain('SAM 2 segmentation')
    expect(html).toContain('Selected asset activity')
    expect(html).toContain('Existing directive')
    expect(html).toContain('mask-lift')
    expect(html).toContain('Clean mask')
  })

  it('emits run and derivative actions', async () => {
    const { app, host, events } = await mount(baseProps)

    try {
      ;([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Run')) as HTMLButtonElement).click()
      ;(host.querySelector('button[aria-label="Clear mask"]') as HTMLButtonElement).click()
      ;(host.querySelector('button[aria-label="Save mask"]') as HTMLButtonElement).click()
      ;(host.querySelector('button[aria-label="Add derivative to timeline"]') as HTMLButtonElement).click()
      ;(host.querySelector('button[aria-label="Reuse derivative in generated bucket"]') as HTMLButtonElement).click()
      await nextTick()

      expect(events.map(event => event.name)).toEqual([
        'run',
        'clear-mask',
        'upload-mask',
        'add-derivative-to-timeline',
        'add-derivative-to-bucket',
      ])
    } finally {
      app.unmount()
    }
  })
})
