// @vitest-environment happy-dom
// Video Studio Generate follow-up: real-asset thumbnails with honest fallback,
// completion card placement + Add at playhead, sticky inspector navigation, and
// an in-flow Generate button that cannot cover the workflow selector.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import MediaGeneratedThumbnail from '~~/app/components/media/MediaGeneratedThumbnail.vue'
import MediaGenerationStatus from '~~/app/components/media/MediaGenerationStatus.vue'
import MediaGenerateComposer from '~~/app/components/media/MediaGenerateComposer.vue'
import VideoStudioInspector from '~~/app/components/media/VideoStudioInspector.vue'
import type { VideoGenerationJobView } from '~~/app/composables/useVideoGenerationJobs'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

const slotStub = { template: '<div><slot /></div>' }
const stubs: Record<string, object> = {
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  USkeleton: { template: '<div data-skeleton />' },
  UBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
  UCard: slotStub,
  UButton: { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot />{{ label }}</button>' }
}

function mount(component: object, props: Record<string, unknown>, extra: Record<string, object> = {}, slots: Record<string, () => unknown> = {}) {
  app = createApp({ render: () => h(component, props, slots) })
  for (const [name, stub] of Object.entries({ ...stubs, ...extra })) app.component(name, stub)
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  return host
}

function job(overrides: Partial<VideoGenerationJobView> = {}): VideoGenerationJobView {
  return {
    id: 'job-1',
    status: 'succeeded',
    mode: 'image-to-video',
    modelId: 'aigateway/seedance-i2v',
    prompt: 'Slow push-in on the hero car',
    sourceAssetIds: ['src-1'],
    durationSeconds: 6,
    aspectRatio: '9:16',
    resolution: null,
    subjectType: 'vehicle',
    outputAssetId: 'asset-1',
    outputR2Key: 'video/asset-1.mp4',
    errorMessage: null,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    startedAt: new Date(Date.now() - 55_000).toISOString(),
    completedAt: new Date(Date.now() - 5_000).toISOString(),
    ...overrides
  }
}

describe('MediaGeneratedThumbnail', () => {
  it('streams the actual output asset and seeks past the opening frame before revealing it', async () => {
    const host = mount(MediaGeneratedThumbnail, { assetId: 'asset 1', durationSec: 6 })
    const video = host.querySelector('video')!
    expect(video.getAttribute('src')).toBe('/api/agency/video/assets/asset%201/stream')
    expect(video.getAttribute('src')).not.toContain('#t=')
    expect(host.querySelector('[data-thumbnail-state]')?.getAttribute('data-thumbnail-state')).toBe('loading')

    Object.defineProperty(video, 'duration', { configurable: true, value: 6 })
    video.dispatchEvent(new Event('loadedmetadata'))
    for (let i = 0; i < 6; i++) {
      await flush()
      video.dispatchEvent(new Event('seeked'))
    }
    await flush()

    expect(video.currentTime).toBe(3)
    expect(host.querySelector('[data-thumbnail-state]')?.getAttribute('data-thumbnail-state')).toBe('ready')
    expect(host.textContent).not.toContain('No preview')
  })

  it('shows a visible "No preview" fallback when the browser cannot decode the clip', async () => {
    const host = mount(MediaGeneratedThumbnail, { assetId: 'asset-1' })
    host.querySelector('video')!.dispatchEvent(new Event('error'))
    await flush()
    expect(host.querySelector('[data-thumbnail-state]')?.getAttribute('data-thumbnail-state')).toBe('unavailable')
    expect(host.textContent).toContain('No preview')
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('unavailable')
  })

  it('falls back instead of spinning forever when decoding never responds', async () => {
    vi.useFakeTimers()
    const host = mount(MediaGeneratedThumbnail, { assetId: 'asset-1', timeoutMs: 1000 })
    vi.advanceTimersByTime(1001)
    await flush()
    expect(host.textContent).toContain('No preview')
  })

  it('waits for a library card to become visible before decoding the uploaded clip', async () => {
    let reportVisibility: IntersectionObserverCallback | undefined
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { reportVisibility = callback }
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    const host = mount(MediaGeneratedThumbnail, { sourceUrl: '/library/clip.mp4', lazy: true })
    await flush()
    expect(host.querySelector('video')).toBeNull()
    const target = host.querySelector('[data-thumbnail-state]')!
    reportVisibility?.([{ target, time: 1, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await flush()
    const video = host.querySelector('video')!
    expect(video.getAttribute('src')).toBe('/library/clip.mp4')
    expect(video.autoplay).toBe(false)
    expect(video.controls).toBe(false)
  })
})

describe('MediaGenerationStatus', () => {
  it('anchors under the header instead of over the timeline Split/Delete toolbar', async () => {
    const host = mount(MediaGenerationStatus, { jobs: [job({ status: 'running', completedAt: null })] })
    await flush()
    const stack = host.querySelector('[data-generation-status]')!
    expect(stack.className).toContain('top-[')
    expect(stack.className).not.toMatch(/\bbottom-/)
  })

  it('offers Add at playhead on success, emits the timeline payload, and dismisses the card', async () => {
    const added = vi.fn()
    const host = mount(MediaGenerationStatus, { jobs: [job()], onAddToTimeline: added })
    await flush()
    expect(host.querySelector('video')?.getAttribute('src')).toBe('/api/agency/video/assets/asset-1/stream')

    const add = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Add at playhead'))!
    add.click()
    await flush()

    expect(added).toHaveBeenCalledWith({
      assetId: 'asset-1',
      r2Key: 'video/asset-1.mp4',
      durationSec: 6,
      streamUrl: '/api/agency/video/assets/asset-1/stream',
      title: 'Slow push-in on the hero car',
      format: '9:16'
    })
    expect(host.querySelector('[data-generation-status-job="job-1"]')).toBeNull()
  })

  it('hides Add at playhead when the host cannot place clips or the output is incomplete', async () => {
    const unwired = mount(MediaGenerationStatus, { jobs: [job()] })
    await flush()
    expect(unwired.textContent).not.toContain('Add at playhead')
    app?.unmount()

    const incomplete = mount(MediaGenerationStatus, { jobs: [job({ outputR2Key: null })], onAddToTimeline: vi.fn() })
    await flush()
    expect(incomplete.textContent).toContain('Done — in Library')
    expect(incomplete.textContent).not.toContain('Add at playhead')
  })
})

describe('VideoStudioInspector navigation', () => {
  it('keeps the tab navigation sticky above scrolling panel content', async () => {
    const host = mount(VideoStudioInspector, { tab: 'produce' }, {
      UTabs: { props: ['items'], template: '<nav><button v-for="item in items" :key="item.value">{{ item.label }}</button></nav>' }
    }, { produce: () => h('p', 'Recent generations') })
    await flush()
    const nav = host.querySelector('[data-inspector-nav]')!
    const body = host.querySelector('[data-inspector-content]')!
    expect(body.className).toContain('overflow-y-auto')
    expect(body.contains(nav)).toBe(false)
    expect(body.textContent).toContain('Recent generations')
    expect(nav.textContent).toContain('Produce')
    expect(nav.contains(host.querySelector('p'))).toBe(false)
  })
})

describe('MediaGenerateComposer layout', () => {
  it('puts the workflow selector and inputs before an in-flow Generate button with a visible estimate', async () => {
    const seedance = { ...getVideoGenerationModel('aigateway/seedance-i2v')!, label: 'Seedance' }
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url === '/api/agency/video/generation/models') return { models: [seedance] }
      throw new Error(`Unexpected request: ${url}`)
    }))
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    const selectStub = {
      props: ['modelValue', 'items'],
      emits: ['update:modelValue'],
      template: `<select :value="modelValue"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>`
    }
    const host = mount(MediaGenerateComposer, {
      active: true,
      projectId: 'project-layout-test',
      timelineStills: [],
      defaultAspect: '9:16',
      recentJobs: [job()]
    }, {
      UInput: slotStub, UAlert: slotStub, UTextarea: { template: '<textarea />' }, UFormField: slotStub,
      USelect: selectStub, USelectMenu: selectStub
    })
    await flush()

    const workflow = host.querySelector('select[aria-label="What to make"]')!
    const submit = host.querySelector('[data-generation-submit]')!
    const generate = [...submit.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Generate')!
    expect(generate).toBeTruthy()
    expect(submit.className).not.toContain('sticky')
    for (const control of [workflow, host.querySelector('select[aria-label="Model"]')!, host.querySelector('textarea')!, host.querySelector('select[aria-label="Clip duration"]')!]) {
      // DOCUMENT_POSITION_FOLLOWING: Generate comes after every input in flow.
      expect(control.compareDocumentPosition(generate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const estimate = submit.querySelector('[data-generation-estimate]')!
    expect(estimate.textContent).toMatch(/Estimated cost\s*US\$\d+\.\d{2}/)

    // Recent generations use the real-asset thumbnail, not a `#t=0.1` first frame.
    const recent = host.querySelector('[data-generation-job="job-1"] video')!
    expect(recent.getAttribute('src')).toBe('/api/agency/video/assets/asset-1/stream')
  })
})
