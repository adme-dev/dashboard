// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioPrepareWorkspace from '~~/app/components/media/VideoStudioPrepareWorkspace.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UButton: {
    name: 'UButton',
    props: ['label', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UFormField: { name: 'UFormField', props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  USelectMenu: { name: 'USelectMenu', props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue" data-asset-select @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items || []" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  UTextarea: { name: 'UTextarea', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :placeholder="placeholder" />' },
  USlider: { name: 'USlider', props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="range" :value="modelValue" />' },
  USkeleton: { name: 'USkeleton', template: '<div />' }
}

const baseProps = {
  assetOptions: [{ label: 'Forecourt wide shot', value: 'item-1' }, { label: 'Showroom still', value: 'item-2' }],
  selectedItemId: 'item-1',
  selectedItemAssetId: 'asset-1',
  toolOptions: [
    { label: 'Erase and heal', value: 'erase-fill', description: 'Remove a highlighted object.' },
    { label: 'Remove background', value: 'background-removal', description: 'Create an alpha foreground.' }
  ],
  selectedAction: 'erase-fill',
  toolPrompt: 'Erase the sign',
  brushSize: 24,
  maskToolEnabled: true,
  previewImageUrl: '/api/agency/video/assets/asset-1/thumbnail',
  previewVideoUrl: '/api/agency/video/assets/asset-1/stream',
  frameWidth: 1280,
  frameHeight: 720,
  hasMaskStroke: true,
  canUndoMask: true,
  running: false,
  loading: false,
  selectedItemJobs: [],
  selectedDerivatives: [{ id: 'derivative-1', kind: 'edited-image', r2Key: 'video-asset-derivatives/t/p/j/edited.png', metadata: {} }],
  loadingDerivatives: false,
  addingDerivativeId: null,
  recentJobs: []
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VideoStudioPrepareWorkspace, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(props: Record<string, unknown>) {
  const events: Array<{ name: string, payload?: unknown }> = []
  const record = (name: string) => (payload?: unknown) => events.push({ name, payload })
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioPrepareWorkspace, {
      ...props,
      'onRun': record('run'),
      'onClearMask': record('clear-mask'),
      'onUndoMask': record('undo-mask'),
      'onFrameSize': record('frame-size'),
      'onPreviewVideoReady': record('preview-video-ready'),
      'onUpdate:selectedAction': record('update:selectedAction'),
      'onAddDerivativeToTimeline': record('add-derivative-to-timeline')
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host, events }
}

function buttonByText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(el => el.textContent?.includes(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button as HTMLButtonElement
}

describe('VideoStudioPrepareWorkspace', () => {
  it('sizes the mask canvas to the picture, not to a fixed 9:16 frame', async () => {
    const html = await render(baseProps)
    expect(html).toMatch(/<canvas[^>]*width="1280"[^>]*height="720"/)
    expect(html).not.toContain('aspect-[9/16]')
    expect(html).not.toContain('width="540"')
    // The picture is stretched to exactly the frame the canvas covers, so strokes land where drawn.
    expect(html).toContain('object-fill')
    expect(html).not.toContain('object-cover')
  })

  it('lays out from its own width so it works in any pane', async () => {
    const html = await render(baseProps)
    expect(html).toContain('@container')
    expect(html).toContain('@4xl:grid-cols-[232px_minmax(0,1fr)_264px]')
    expect(html).not.toMatch(/(?<![@\w])(md|lg|xl):grid-cols/)
  })

  it('reports the real size of the picture once it loads', async () => {
    const { app, host, events } = await mount(baseProps)
    try {
      const image = host.querySelector('img') as HTMLImageElement
      Object.defineProperty(image, 'naturalWidth', { value: 1920 })
      Object.defineProperty(image, 'naturalHeight', { value: 1080 })
      image.dispatchEvent(new Event('load'))
      expect(events).toContainEqual({ name: 'frame-size', payload: { width: 1920, height: 1080 } })
    } finally {
      app.unmount()
    }
  })

  it('falls back to the video when the asset has no still', async () => {
    const html = await render({ ...baseProps, previewImageUrl: null })
    expect(html).toContain('<video')
    expect(html).not.toContain('<img')
    const none = await render({ ...baseProps, previewImageUrl: null, previewVideoUrl: null, hasMaskStroke: false })
    expect(none).toContain('This asset has no preview picture yet.')
  })

  it('offers tools as a labelled choice and names the Run action after the tool', async () => {
    const { app, host, events } = await mount(baseProps)
    try {
      const radios = [...host.querySelectorAll('[role="radio"]')]
      expect(radios.map(el => el.getAttribute('aria-checked'))).toEqual(['true', 'false'])
      buttonByText(host, 'Remove background').click()
      expect(events).toContainEqual({ name: 'update:selectedAction', payload: 'background-removal' })
      buttonByText(host, 'Run erase and heal').click()
      buttonByText(host, 'Undo').click()
      buttonByText(host, 'Clear').click()
      buttonByText(host, 'Add to timeline').click()
      expect(events.map(event => event.name)).toEqual(expect.arrayContaining(['run', 'undo-mask', 'clear-mask', 'add-derivative-to-timeline']))
    } finally {
      app.unmount()
    }
  })

  it('hides painting controls for whole-picture tools and blocks Run without an asset', async () => {
    const html = await render({ ...baseProps, maskToolEnabled: false, selectedItemAssetId: null })
    expect(html).toContain('This tool works on the whole picture.')
    expect(html).not.toContain('Brush size')
    expect(html).toMatch(/<button disabled[^>]*>[^<]*(<!--[^>]*-->)*Run erase and heal/)
    // Internal storage keys are never shown as result names.
    const named = await render(baseProps)
    expect(named).toContain('edited-image result')
    expect(named).not.toContain('video-asset-derivatives/')
  })

  it('marks a tool with no provider as not available yet and will not run it', async () => {
    const tools = [
      { label: 'Erase and heal', value: 'erase-fill', description: 'Remove a highlighted object.', available: true, unavailableReason: null },
      { label: 'Remove background', value: 'background-removal', description: 'Create an alpha foreground.', available: false, unavailableReason: 'Remove background is not available yet.' }
    ]
    const { app, host, events } = await mount({ ...baseProps, toolOptions: tools, selectedAction: 'background-removal', maskToolEnabled: false })
    try {
      expect(host.textContent).toContain('Not available yet')
      expect(host.querySelector('[data-run-blocked]')?.textContent).toContain('Remove background is not available yet.')
      const run = buttonByText(host, 'Run remove background')
      expect(run.disabled).toBe(true)
      run.click()
      expect(events.map(event => event.name)).not.toContain('run')
    } finally {
      app.unmount()
    }
    // The available tool carries no badge.
    const html = await render({ ...baseProps, toolOptions: tools })
    expect(html.match(/Not available yet/g)).toHaveLength(1)
  })

  it('asks for a painted area before erase can run, and is explicit that a video is not erased', async () => {
    const unpainted = await render({ ...baseProps, hasMaskStroke: false })
    expect(unpainted).toContain('Paint over what to erase first.')
    expect(unpainted).toMatch(/<button disabled[^>]*>[^<]*(<!--[^>]*-->)*Run erase and heal/)
    const ready = await render(baseProps)
    expect(ready).not.toContain('Paint over what to erase first.')
    expect(ready).toContain('On a video it uses the frame you painted on and gives you a still; the video itself is not changed.')
    const fromVideo = await render({ ...baseProps, selectedDerivatives: [{ id: 'd', kind: 'edited-image', r2Key: 'k', metadata: { title: 'Erased still from video frame', note: 'Made from a still frame of the video. The video itself is unchanged.' } }] })
    expect(fromVideo).toContain('Erased still from video frame')
    expect(fromVideo).toContain('The video itself is unchanged.')
  })
  // Erase needs a still. A video has none, so the parent captures the frame from this element.
  it('hands the video under the mask to the parent, and nothing when a still is shown', async () => {
    const withVideo = await mount({ ...baseProps, previewImageUrl: null, previewVideoUrl: '/api/agency/video/assets/asset-1/stream?inline=1' })
    try {
      const video = withVideo.host.querySelector('video')!
      // The first frame must be decoded to be captured: metadata alone is not enough.
      expect(video.getAttribute('preload')).toBe('auto')
      expect(video.getAttribute('src')).toBe('/api/agency/video/assets/asset-1/stream?inline=1')
      const ready = withVideo.events.filter(event => event.name === 'preview-video-ready')
      expect(ready[ready.length - 1]!.payload).toBe(video)
    } finally {
      withVideo.app.unmount()
    }
    expect(withVideo.events[withVideo.events.length - 1]).toEqual({ name: 'preview-video-ready', payload: null })

    const withStill = await mount(baseProps)
    try {
      expect(withStill.host.querySelector('video')).toBeNull()
      expect(withStill.events.filter(event => event.name === 'preview-video-ready').every(event => event.payload === null)).toBe(true)
    } finally {
      withStill.app.unmount()
    }
  })

  it('asks for a painted area before Lift can run, and runs the whole-picture layer tools without one', async () => {
    const tools = [
      { label: 'Lift highlighted area', value: 'mask-lift', description: 'Paint over a graphic to lift it out.', available: true, unavailableReason: null },
      { label: 'Separate layers', value: 'layer-decomposition', description: 'Split a flattened picture.', available: true, unavailableReason: null },
    ]
    const unpainted = await render({ ...baseProps, toolOptions: tools, selectedAction: 'mask-lift', hasMaskStroke: false })
    expect(unpainted).toContain('Paint over what to lift first.')
    expect(unpainted).toMatch(/<button disabled[^>]*>[^<]*(<!--[^>]*-->)*Run lift highlighted area/)
    const painted = await render({ ...baseProps, toolOptions: tools, selectedAction: 'mask-lift', hasMaskStroke: true })
    expect(painted).not.toContain('Paint over what to lift first.')
    expect(painted).not.toMatch(/<button disabled[^>]*>[^<]*(<!--[^>]*-->)*Run lift highlighted area/)

    // Separate layers needs no paint and carries no "Not available yet" badge.
    const { app, host, events } = await mount({ ...baseProps, toolOptions: tools, selectedAction: 'layer-decomposition', maskToolEnabled: false, hasMaskStroke: false })
    try {
      expect(host.textContent).not.toContain('Not available yet')
      const run = buttonByText(host, 'Run separate layers')
      expect(run.disabled).toBe(false)
      run.click()
      expect(events.map(event => event.name)).toContain('run')
    } finally {
      app.unmount()
    }
  })
})
