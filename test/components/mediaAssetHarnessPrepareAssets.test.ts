// @vitest-environment happy-dom
// Prepare needs a library asset with a still. These cover the three ways it now gets one:
// a frame saved on demand for a video without one, an upload, and a kept result.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

const mockCapture = vi.fn()
vi.mock('~~/app/utils/video/captureVideoFrame', () => ({
  captureVideoFrame: (...args: unknown[]) => mockCapture(...args)
}))
vi.mock('~~/app/utils/video/mediaUploadPreview', async importOriginal => ({
  ...await importOriginal<typeof import('~~/app/utils/video/mediaUploadPreview')>(),
  readMediaUploadPreview: vi.fn(async () => ({ width: 1920, height: 1080, durationSec: null, poster: null }))
}))

// The workspace is presentational: stand in for it and drive its events directly.
let workspace: { props: Record<string, unknown>, emit: (event: string, ...args: unknown[]) => void } | null = null
vi.mock('~~/app/components/media/VideoStudioPrepareWorkspace.vue', () => ({
  default: defineComponent({
    name: 'VideoStudioPrepareWorkspace',
    inheritAttrs: false,
    setup(_props, { attrs, emit }) {
      return () => {
        workspace = { props: attrs as Record<string, unknown>, emit: emit as never }
        return h('div')
      }
    }
  })
}))

const { default: MediaAssetHarness } = await import('~~/app/components/media/MediaAssetHarness.vue')

const toasts: Array<{ title: string, description?: string, color?: string }> = []
const calls: Array<{ url: string, method: string, body?: unknown }> = []
let items: Array<Record<string, unknown>> = []
let failThumbnail = false

const fetchMock = vi.fn(async (url: string, options: { method?: string, body?: unknown } = {}) => {
  calls.push({ url, method: options.method ?? 'GET', body: options.body })
  if (url.endsWith('/buckets')) return { buckets: [{ id: 'b1', kind: 'generated', name: 'Generated', sortOrder: 1 }], items }
  if (url.endsWith('/asset-intelligence/models')) {
    return { actions: [{ id: 'layer-decomposition', label: 'Separate layers', description: '', outputKinds: [], available: true }, { id: 'erase-fill', label: 'Erase', description: '', outputKinds: [], available: true }], models: [] }
  }
  if (url.endsWith('/intelligence-jobs')) return { jobs: [] }
  if (url.endsWith('/derivatives')) return { derivatives: [] }
  if (url.endsWith('/thumbnail')) {
    if (failThumbnail) throw Object.assign(new Error('nope'), { data: { statusMessage: 'Storage is unavailable' } })
    return { saved: true }
  }
  if (url.endsWith('/extract')) return { job: { id: 'j1', status: 'queued' } }
  if (url.endsWith('/directive')) return { item: items[0] }
  if (url.endsWith('/upload-media')) {
    items = [...items, { id: 'item-new', bucketId: 'b1', assetId: 'asset-new', r2Key: 'media/p/still/hero.png', title: 'hero', role: 'uploaded-still', directive: {}, status: 'ready' }]
    return { r2_key: 'media/p/still/hero.png', assetId: 'asset-new' }
  }
  if (url.endsWith('/add-to-bucket')) return { item: { id: 'item-kept', assetId: 'asset-kept' } }
  throw new Error(`Unexpected request ${url}`)
})

async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

async function mountHarness() {
  const emitted: string[] = []
  const app = createApp({
    render: () => h(MediaAssetHarness, { projectId: 'project-1', workspace: true, onAssetsChanged: () => emitted.push('assets-changed') })
  })
  app.mount(document.createElement('div'))
  await settle()
  return { app, emitted }
}

const posts = () => calls.filter(call => call.method === 'POST').map(call => call.url.split('/').pop())

describe('MediaAssetHarness: assets Prepare can use', () => {
  beforeEach(() => {
    toasts.length = 0
    calls.length = 0
    failThumbnail = false
    workspace = null
    items = [{ id: 'item-1', bucketId: 'b1', assetId: 'asset-1', r2Key: 'video/clip.mp4', title: 'Clip', role: 'generated-video', directive: {}, status: 'ready' }]
    mockCapture.mockReset()
    mockCapture.mockResolvedValue(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }))
    vi.stubGlobal('useToast', () => ({ add: (toast: { title: string }) => toasts.push(toast) }))
    vi.stubGlobal('$fetch', fetchMock)
  })

  it('saves the frame on screen before running a whole-picture tool on a video with no still', async () => {
    const { app } = await mountHarness()
    try {
      workspace!.emit('update:selectedAction', 'layer-decomposition')
      // The video is on stage because the asset has no saved still.
      workspace!.emit('preview-video-ready', document.createElement('video'))
      await settle()
      workspace!.emit('run')
      await settle()

      expect(posts()).toEqual(['thumbnail', 'extract', 'directive'])
      const thumbnail = calls.find(call => call.url.endsWith('/thumbnail'))!
      expect(thumbnail.url).toBe('/api/agency/video/assets/asset-1/thumbnail')
      expect(((thumbnail.body as FormData).get('file') as File).type).toBe('image/jpeg')
    } finally {
      app.unmount()
    }
  })

  it('does not capture anything when a saved still is already showing', async () => {
    const { app } = await mountHarness()
    try {
      workspace!.emit('update:selectedAction', 'layer-decomposition')
      await settle()
      workspace!.emit('run')
      await settle()
      expect(mockCapture).not.toHaveBeenCalled()
      expect(posts()).toEqual(['extract', 'directive'])
    } finally {
      app.unmount()
    }
  })

  it('stops and says what to do when the video frame cannot be captured', async () => {
    mockCapture.mockRejectedValue(new Error('The video is still loading. Wait until you can see it, then run again.'))
    const { app } = await mountHarness()
    try {
      workspace!.emit('update:selectedAction', 'layer-decomposition')
      workspace!.emit('preview-video-ready', document.createElement('video'))
      await settle()
      workspace!.emit('run')
      await settle()

      // No job is queued that could only fail in the worker.
      expect(posts()).toEqual([])
      expect(toasts.at(-1)).toMatchObject({ title: 'No still frame of this video yet', color: 'warning' })
      expect(toasts.at(-1)!.description).toContain('Wait until you can see the video in the picture area, then run again')
    } finally {
      app.unmount()
    }
  })

  it('reports a failed save as a save problem, not a loading problem', async () => {
    failThumbnail = true
    const { app } = await mountHarness()
    try {
      workspace!.emit('update:selectedAction', 'layer-decomposition')
      workspace!.emit('preview-video-ready', document.createElement('video'))
      await settle()
      workspace!.emit('run')
      await settle()
      expect(posts()).toEqual(['thumbnail'])
      expect(toasts.at(-1)).toMatchObject({ title: 'Could not save a still frame of this video' })
      expect(toasts.at(-1)!.description).toContain('Storage is unavailable')
    } finally {
      app.unmount()
    }
  })

  it('uploads a picture as a library asset and selects it', async () => {
    const { app, emitted } = await mountHarness()
    try {
      workspace!.emit('upload-file', new File([new Uint8Array([1])], 'hero.png', { type: 'image/png' }))
      await settle()

      const upload = calls.find(call => call.url.endsWith('/upload-media'))!
      expect(upload.url).toBe('/api/agency/audio/projects/project-1/upload-media')
      const form = upload.body as FormData
      expect(form.get('kind')).toBe('still')
      expect(form.get('width')).toBe('1920')
      expect(workspace!.props['selected-item-id'] ?? workspace!.props.selectedItemId).toBe('item-new')
      expect(workspace!.props['selected-item-asset-id'] ?? workspace!.props.selectedItemAssetId).toBe('asset-new')
      expect(emitted).toContain('assets-changed')
      expect(toasts.at(-1)).toMatchObject({ title: 'Picture added to assets', color: 'success' })
    } finally {
      app.unmount()
    }
  })

  it('refuses a file type the tools cannot open, without uploading', async () => {
    const { app } = await mountHarness()
    try {
      workspace!.emit('upload-file', new File([new Uint8Array([1])], 'brief.pdf', { type: 'application/pdf' }))
      await settle()
      expect(posts()).toEqual([])
      expect(toasts.at(-1)).toMatchObject({ title: 'This file type cannot be prepared', color: 'warning' })
    } finally {
      app.unmount()
    }
  })

  it('tells the user a kept picture can now be chosen in the Asset list', async () => {
    const { app, emitted } = await mountHarness()
    try {
      workspace!.emit('add-derivative-to-bucket', { id: 'd1', sourceAssetId: 'asset-1', projectId: 'project-1', kind: 'edited-image', r2Key: 'x.png', width: 1, height: 1, metadata: { title: 'Sign erased' }, createdAt: 'now' })
      await settle()
      const keep = calls.find(call => call.url.endsWith('/add-to-bucket'))!
      expect((keep.body as { title: string }).title).toBe('Sign erased')
      expect(emitted).toContain('assets-changed')
      expect(toasts.at(-1)).toMatchObject({ title: 'Kept in assets', description: 'Choose it in the Asset list to prepare it.' })
    } finally {
      app.unmount()
    }
  })
})
