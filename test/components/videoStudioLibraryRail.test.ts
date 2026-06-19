// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioLibraryRail from '~~/app/components/media/VideoStudioLibraryRail.vue'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled'],
    emits: ['click'],
    template: '<button :data-icon="icon" :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UInput: {
    name: 'UInput',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelect: {
    name: 'USelect',
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  USkeleton: { name: 'USkeleton', template: '<div />' }
}

function asset(overrides: Partial<VideoStudioAsset>): VideoStudioAsset {
  return {
    id: 'video:asset-1',
    rawId: 'asset-1',
    libraryAssetId: null,
    type: 'video',
    source: 'generation',
    title: 'Generated drive-by',
    subtitle: '9:16',
    status: 'ready',
    modelId: 'replicate/wan-2.2',
    bucketId: null,
    role: null,
    prompt: 'Slow dolly past the car',
    r2Key: 'generated/drive.mp4',
    previewUrl: '/api/agency/video/assets/asset-1/stream',
    thumbnailUrl: null,
    captionVttKey: null,
    captionVttUrl: null,
    transcript: null,
    durationSec: 5,
    format: '9:16',
    timelineReady: true,
    createdAt: null,
    ...overrides,
  }
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VideoStudioLibraryRail, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(props: Record<string, unknown>) {
  const events: Array<{ name: string, payload: unknown }> = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioLibraryRail, {
      ...props,
      'onUpdate:selectedId': (value: string | null) => events.push({ name: 'update:selected-id', payload: value }),
      onAddAsset: (value: VideoStudioAsset) => events.push({ name: 'add-asset', payload: value }),
      onGenerateFromAsset: (value: VideoStudioAsset) => events.push({ name: 'generate-from-asset', payload: value }),
      onInspectAsset: (value: VideoStudioAsset) => events.push({ name: 'inspect-asset', payload: value }),
      onPublishAsset: (value: VideoStudioAsset) => events.push({ name: 'publish-asset', payload: value }),
      onRefresh: () => events.push({ name: 'refresh', payload: null }),
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

function buttonByLabel(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label || el.getAttribute('title') === label)
  if (!button) throw new Error(`Button not found: ${label}`)
  return button as HTMLButtonElement
}

describe('VideoStudioLibraryRail', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders mixed assets with status, metadata, and add actions', async () => {
    const html = await render({
      assets: [
        asset({ id: 'video:asset-1', title: 'Generated drive-by', durationSec: 5, thumbnailUrl: '/thumb.jpg', captionVttKey: 'captions/asset-1.vtt', captionVttUrl: '/api/agency/video/assets/asset-1/captions.vtt' }),
        asset({ id: 'audio:voice-1', rawId: 'voice-1', type: 'audio', source: 'audio', title: 'Opening voiceover', subtitle: 'voiceover', role: 'voiceover', modelId: null, durationSec: 12, previewUrl: '/voice.mp3' }),
        asset({ id: 'audio:music-1', rawId: 'music-1', type: 'audio', source: 'audio', title: 'Queued music bed', subtitle: 'music', role: 'music', modelId: null, status: 'rendering', durationSec: null, timelineReady: false, previewUrl: '/music.mp3' }),
        asset({ id: 'job:job-1', rawId: 'job-1', type: 'job', source: 'generation', title: 'Smoke reveal', subtitle: 'image-to-video', status: 'running', timelineReady: false, r2Key: null, previewUrl: null }),
      ],
      selectedId: null,
      loading: false
    })

    expect(html).toContain('Footage')
    expect(html).toContain('Stills')
    expect(html).toContain('Generated')
    expect(html).toContain('Audio Studio')
    expect(html).toContain('Renders')
    expect(html).toContain('All aspect ratios')
    expect(html).toContain('Newest first')
    expect(html).toContain('Generated drive-by')
    expect(html).toContain('Opening voiceover')
    expect(html).toContain('Queued music bed')
    expect(html).toContain('Smoke reveal')
    expect(html).toContain('Timeline ready')
    expect(html).toContain('Processing')
    expect(html).toContain('AI')
    expect(html).toContain('Audio')
    expect(html).toContain('running')
    expect(html).toContain('rendering')
    expect(html).toContain('5s')
    expect(html).toContain('12s')
    expect(html).toContain('Add')
    expect(html).toContain('Generating')
    expect(html).toContain('/thumb.jpg')
    expect(html).toContain('/voice.mp3')
    expect(html).toContain('i-lucide-eye')
    expect(html).toContain('i-lucide-sparkles')
    expect(html).toContain('i-lucide-share-2')
    expect(html).toContain('i-lucide-info')
    expect(html).toContain('Captions')
    expect(html).toContain('/api/agency/video/assets/asset-1/captions.vtt')
  })

  it('keeps bucket context available in the unified rail', async () => {
    const html = await render({
      assets: [
        asset({
          id: 'bucket:hero',
          rawId: 'hero',
          type: 'bucket',
          source: 'bucket',
          title: 'Hero still',
          subtitle: 'hero',
          bucketId: 'bucket-hero',
          modelId: null,
          role: 'hero',
          r2Key: 'source/hero.png',
        }),
        asset({
          id: 'bucket:generated',
          rawId: 'generated',
          type: 'bucket',
          source: 'bucket',
          title: 'Generated option',
          subtitle: 'generated',
          bucketId: 'bucket-generated',
          modelId: null,
          role: 'generated',
          r2Key: 'source/generated.png',
        }),
      ],
      selectedId: null,
      loading: false
    })

    expect(html).toContain('All buckets')
    expect(html).toContain('bucket-generated')
    expect(html).toContain('Bucket bucket-hero')
    expect(html).toContain('Bucket bucket-generated')
  })

  it('renders an empty state when no assets are available', async () => {
    const html = await render({ assets: [], selectedId: null, loading: false })
    expect(html).toContain('No media in this project yet')
    expect(html).toContain('Add footage or stills')
  })

  it('filters assets by category/source/status/search and emits inline actions', async () => {
    const { app, host, events } = await mount({
      assets: [
        asset({ id: 'video:ready-1', rawId: 'ready-1', title: 'Ready generated video', source: 'generation', status: 'ready', createdAt: '2026-06-18T02:00:00.000Z' }),
        asset({ id: 'audio:voice-1', rawId: 'voice-1', type: 'audio', source: 'audio', title: 'Opening voiceover', subtitle: 'voiceover', role: 'voiceover', modelId: null, durationSec: 12, previewUrl: '/voice.mp3', createdAt: '2026-06-18T01:00:00.000Z' }),
        asset({ id: 'job:running-1', rawId: 'running-1', type: 'job', source: 'generation', title: 'Running smoke reveal', status: 'running', timelineReady: false, r2Key: null, previewUrl: null, createdAt: '2026-06-18T03:00:00.000Z' }),
        asset({ id: 'overlay:banner-1', rawId: 'banner-1', type: 'overlay', source: 'banner', title: 'Offer lower third', status: 'ready', modelId: null, r2Key: 'banner/lower-third.html', createdAt: '2026-06-18T04:00:00.000Z' }),
      ],
      selectedId: null,
      loading: false,
    })

    try {
      expect(host.textContent).toContain('Ready generated video')
      expect(host.textContent).toContain('Opening voiceover')
      expect(host.textContent).toContain('Running smoke reveal')
      expect(host.textContent).toContain('Offer lower third')

      buttonByText(host, 'Voiceover').click()
      await nextTick()
      expect(host.textContent).toContain('Opening voiceover')
      expect(host.textContent).not.toContain('Ready generated video')

      buttonByText(host, 'All').click()
      buttonByText(host, 'AI').click()
      await nextTick()
      expect(host.textContent).toContain('Ready generated video')
      expect(host.textContent).toContain('Running smoke reveal')
      expect(host.textContent).not.toContain('Offer lower third')

      buttonByText(host, 'All sources').click()
      buttonByText(host, 'Running').click()
      await nextTick()
      expect(host.textContent).toContain('Running smoke reveal')
      expect(host.textContent).not.toContain('Ready generated video')

      buttonByText(host, 'All status').click()
      const search = host.querySelector('input[placeholder="Search assets"]') as HTMLInputElement
      search.value = 'lower third'
      search.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
      expect(host.textContent).toContain('Offer lower third')
      expect(host.textContent).not.toContain('Opening voiceover')

      ;(host.querySelector('button[aria-label="Refresh library assets"]') as HTMLButtonElement).click()
      buttonByText(host, 'Offer lower third').click()
      ;(host.querySelector('button[aria-label="Inspect asset"]') as HTMLButtonElement).click()
      buttonByLabel(host, 'Add').click()
      await nextTick()

      expect(events.map(event => event.name)).toEqual(expect.arrayContaining([
        'refresh',
        'update:selected-id',
        'inspect-asset',
        'add-asset',
      ]))
      expect(events.find(event => event.name === 'update:selected-id')?.payload).toBe('overlay:banner-1')
      expect((events.find(event => event.name === 'add-asset')?.payload as VideoStudioAsset).id).toBe('overlay:banner-1')
    } finally {
      app.unmount()
    }
  })

  it('persists reusable filter preferences across rail mounts', async () => {
    const assets = [
      asset({ id: 'video:ready-1', rawId: 'ready-1', title: 'Ready generated video', source: 'generation', status: 'ready' }),
      asset({ id: 'audio:voice-1', rawId: 'voice-1', type: 'audio', source: 'audio', title: 'Opening voiceover', subtitle: 'voiceover', role: 'voiceover', modelId: null, durationSec: 12, previewUrl: '/voice.mp3' }),
    ]

    const first = await mount({ assets, selectedId: null, loading: false })
    try {
      buttonByText(first.host, 'Voiceover').click()
      await nextTick()

      expect(first.host.textContent).toContain('Opening voiceover')
      expect(first.host.textContent).not.toContain('Ready generated video')
      expect(localStorage.getItem('video-studio-library-category')).toBe('voiceover')
    } finally {
      first.app.unmount()
    }

    const second = await mount({ assets, selectedId: null, loading: false })
    try {
      expect(second.host.textContent).toContain('Opening voiceover')
      expect(second.host.textContent).not.toContain('Ready generated video')
    } finally {
      second.app.unmount()
    }
  })
})
