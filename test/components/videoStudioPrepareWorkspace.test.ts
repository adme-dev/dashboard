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
      'onAddDerivativeToTimeline': record('add-derivative-to-timeline'),
      'onAnimateLayers': record('animate-layers'),
      'onUploadFile': record('upload-file')
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
    expect(html).toContain('@container/prepare')
    expect(html).toContain('@4xl/prepare:grid-cols-[232px_minmax(0,1fr)_264px]')
    expect(html).not.toMatch(/(?<![@\w])(md|lg|xl):grid-cols/)
  })

  // The picture column is itself a container (@container/stage). An unnamed @4xl inside it
  // measures that column, which is under 896px until the window is about 1650px wide, so the
  // stage lost flex-1 and collapsed to 0-19px at 1280 and 1440. Every three-column class must
  // name the workspace container.
  it('ties every three-column class to the workspace width, not to the picture column', async () => {
    const html = await render(baseProps)
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap(match => match[1]!.split(/\s+/))
    const breakpoint = classes.filter(name => name.startsWith('@4xl'))
    expect(breakpoint.length).toBeGreaterThan(8)
    expect(breakpoint.filter(name => !name.startsWith('@4xl/prepare:'))).toEqual([])

    const stage = html.match(/<div[^>]*data-prepare-stage[^>]*>/)?.[0] ?? ''
    expect(stage).toContain('@4xl/prepare:flex-1')
    expect(stage).toContain('@4xl/prepare:min-h-40')
    // The only classes that follow the picture column are the ones in the box under the picture.
    const stageScoped = classes.filter(name => name.includes('/stage:'))
    expect(stageScoped.length).toBeGreaterThan(0)
    expect(stageScoped.every(name => name.startsWith('@2xl/stage:'))).toBe(true)
  })

  // The pane is 271-435px tall on a laptop (the timeline stays docked), so the controls
  // take one row above the picture instead of a tall box under it.
  it('puts the paint controls and Run in one toolbar above the picture', async () => {
    const html = await render(baseProps)
    const toolbar = html.indexOf('data-prepare-toolbar')
    const stage = html.indexOf('data-prepare-stage')
    const run = html.indexOf('Run erase and heal')
    expect(toolbar).toBeGreaterThan(-1)
    expect(html.indexOf('aria-label="Brush size"')).toBeGreaterThan(toolbar)
    expect(html.indexOf('aria-label="Brush size"')).toBeLessThan(stage)
    expect(run).toBeGreaterThan(toolbar)
    expect(run).toBeLessThan(stage)
    // Only the optional instruction sits under the picture.
    expect(html.indexOf('Optional. Say what to lift')).toBeGreaterThan(stage)
    // Stacked, the grid keeps its natural height so the pane scrolls and the stage is not squeezed to nothing.
    expect(html).toMatch(/<div class="grid shrink-0 grid-cols-1 @4xl\/prepare:min-h-0 @4xl\/prepare:flex-1/)
    expect(html.match(/<div[^>]*data-prepare-stage[^>]*>/)![0]).toContain('shrink-0')
  })

  it('uploads a picked picture or video as a new asset', async () => {
    const { app, host, events } = await mount(baseProps)
    try {
      expect(buttonByText(host, 'Upload a picture or video')).toBeTruthy()
      const input = host.querySelector('[data-upload-input]') as HTMLInputElement
      expect(input.accept).toContain('image/png')
      expect(input.accept).toContain('video/mp4')
      const file = new File([new Uint8Array([1])], 'hero.png', { type: 'image/png' })
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change'))
      expect(events).toContainEqual({ name: 'upload-file', payload: file })
    } finally {
      app.unmount()
    }
  })

  it('says how to fix an item that is not a library asset, instead of "choose an asset"', async () => {
    const kept = await render({ ...baseProps, selectedItemAssetId: null })
    expect(kept).toContain('This item is not a library asset yet.')
    expect(kept).toContain('Keep in assets')
    const none = await render({ ...baseProps, selectedItemId: null, selectedItemAssetId: null })
    expect(none).toContain('Choose an asset first, or upload a picture or video.')
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
    const html = await render({ ...baseProps, maskToolEnabled: false, selectedItemId: null, selectedItemAssetId: null })
    expect(html).toContain('Choose an asset first, or upload a picture or video.')
    expect(html).not.toContain('Brush size')
    expect(html).not.toContain('aria-label="Undo"')
    // With an asset chosen, the same line says no painting is needed.
    expect(await render({ ...baseProps, maskToolEnabled: false })).toContain('This tool works on the whole picture. No painting needed.')
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
    // The note about video appears only when a video, not a still, is under the mask.
    expect(ready).not.toContain('The video itself is not changed.')
    const onVideo = await render({ ...baseProps, previewImageUrl: null })
    expect(onVideo).toContain('erase uses the video frame you paint on and gives you a still. The video itself is not changed.')
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

  it('sends a layer package to the timeline as animated layers, not as a single picture', async () => {
    const pkg = { id: 'pkg-1', kind: 'layer-package', r2Key: 'video-asset-derivatives/t/p/j/layers.json', metadata: { title: '6 layers and a base' } }
    const layer = { id: 'layer-1', kind: 'foreground-png', r2Key: 'video-asset-derivatives/t/p/j/layer-01-car.png', metadata: { title: 'car' } }
    const { app, host, events } = await mount({ ...baseProps, selectedDerivatives: [pkg, layer] })
    try {
      const cards = [...host.querySelectorAll('.rounded-md.border')].filter(card => card.textContent?.includes('Keep in assets'))
      const packageCard = cards.find(card => card.textContent?.includes('6 layers and a base'))!
      expect(packageCard.textContent).toContain('Animate layers')
      expect(packageCard.textContent).not.toContain('Add to timeline')
      const layerCard = cards.find(card => card.textContent?.includes('car'))!
      expect(layerCard.textContent).toContain('Add to timeline')
      expect(layerCard.textContent).not.toContain('Animate layers')
      buttonByText(host, 'Animate layers').click()
      expect(events).toContainEqual({ name: 'animate-layers', payload: pkg })
    } finally {
      app.unmount()
    }
  })
})
