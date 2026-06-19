// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioSelectedAssetPanel from '~~/app/components/media/VideoStudioSelectedAssetPanel.vue'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    emits: ['click'],
    props: ['icon', 'label', 'disabled', 'loading', 'to'],
    template: '<a v-if="to" :href="to" :data-icon="icon"><slot />{{ label }}</a><button v-else :data-icon="icon" :disabled="disabled" :data-loading="loading" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UAlert: { name: 'UAlert', props: ['title', 'description'], template: '<section><strong>{{ title }}</strong><p>{{ description }}</p></section>' }
}

function asset(overrides: Partial<VideoStudioAsset> = {}): VideoStudioAsset {
  return {
    id: 'video:asset-1',
    rawId: 'asset-1',
    libraryAssetId: 'asset-1',
    type: 'video',
    source: 'generation',
    title: 'Generated walkaround',
    subtitle: '9:16',
    status: 'ready',
    modelId: 'replicate/wan-2.2',
    bucketId: 'hero',
    role: null,
    prompt: 'Slow push around the vehicle',
    r2Key: 'generated/walkaround.mp4',
    previewUrl: '/api/agency/video/assets/asset-1/stream',
    thumbnailUrl: '/api/agency/video/assets/asset-1/thumbnail',
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
  const app = createSSRApp({ render: () => h(VideoStudioSelectedAssetPanel, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(props: Record<string, unknown>) {
  const events: Array<{ name: string, payload: VideoStudioAsset }> = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioSelectedAssetPanel, {
      ...props,
      onAddToTimeline: (value: VideoStudioAsset) => events.push({ name: 'add-to-timeline', payload: value }),
      onReplaceSelectedClip: (value: VideoStudioAsset) => events.push({ name: 'replace-selected-clip', payload: value }),
      onAddCaptionsToTimeline: (value: VideoStudioAsset) => events.push({ name: 'add-captions-to-timeline', payload: value }),
      onGenerateFromAsset: (value: VideoStudioAsset) => events.push({ name: 'generate-from-asset', payload: value }),
      onGenerateCaptions: (value: VideoStudioAsset) => events.push({ name: 'generate-captions', payload: value }),
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

describe('VideoStudioSelectedAssetPanel', () => {
  it('renders selected asset preview, metadata, prompt, and actions', async () => {
    const html = await render({
      asset: asset(),
      activity: [
        {
          id: 'generation:job-1',
          label: 'Generated video asset',
          detail: 'Slow push around the vehicle',
          status: 'succeeded',
          source: 'replicate/wan-2.2',
          createdAt: '2026-06-18T08:00:00.000Z',
        },
      ],
    })

    expect(html).toContain('Selected asset')
    expect(html).toContain('Generated walkaround')
    expect(html).toContain('/api/agency/video/assets/asset-1/thumbnail')
    expect(html).toContain('Add to timeline')
    expect(html).toContain('Replace selected')
    expect(html).toContain('Generate from asset')
    expect(html).toContain('Generate captions')
    expect(html).toContain('replicate/wan-2.2')
    expect(html).toContain('5s')
    expect(html).toContain('9:16')
    expect(html).toContain('Slow push around the vehicle')
    expect(html).toContain('Asset activity')
    expect(html).toContain('Generated video asset')
    expect(html).toContain('replicate/wan-2.2')
  })

  it('shows failed asset context in-place', async () => {
    const html = await render({
      asset: asset({ status: 'failed', thumbnailUrl: null, previewUrl: null, timelineReady: false }),
    })

    expect(html).toContain('Asset failed')
    expect(html).toContain('Retry generation')
    expect(html).toContain('No preview available')
  })

  it('shows attached captions with transcript preview and VTT download', async () => {
    const html = await render({
      asset: asset({
        captionVttKey: 'video-captions/project/asset/captions.vtt',
        captionVttUrl: '/api/agency/video/assets/asset-1/captions.vtt',
        transcript: 'This is the generated subtitle text.',
      }),
    })

    expect(html).toContain('Regenerate captions')
    expect(html).toContain('Add captions')
    expect(html).toContain('Download VTT')
    expect(html).toContain('/api/agency/video/assets/asset-1/captions.vtt')
    expect(html).toContain('This is the generated subtitle text.')
  })

  it('renders an empty selection state', async () => {
    const html = await render({ asset: null })
    expect(html).toContain('No asset selected')
    expect(html).toContain('Pick an asset from the library')
  })

  it('emits prepare actions for selected timeline-ready captioned assets', async () => {
    const selected = asset({
      captionVttKey: 'video-captions/project/asset/captions.vtt',
      captionVttUrl: '/api/agency/video/assets/asset-1/captions.vtt',
      transcript: 'This is the generated subtitle text.',
      r2Key: 'source/still.png',
      thumbnailUrl: '/api/agency/video/assets/asset-1/thumbnail',
    })
    const { app, host, events } = await mount({
      asset: selected,
      canReplaceSelectedClip: true,
    })

    try {
      buttonByText(host, 'Add to timeline').click()
      buttonByText(host, 'Replace selected').click()
      buttonByText(host, 'Generate from asset').click()
      buttonByText(host, 'Regenerate captions').click()
      buttonByText(host, 'Add captions').click()
      await nextTick()

      expect(events.map(event => event.name)).toEqual([
        'add-to-timeline',
        'replace-selected-clip',
        'generate-from-asset',
        'generate-captions',
        'add-captions-to-timeline',
      ])
      expect(events.every(event => event.payload.id === selected.id)).toBe(true)
    } finally {
      app.unmount()
    }
  })

  it('disables unsafe prepare actions for unavailable assets', async () => {
    const { app, host, events } = await mount({
      asset: asset({
        status: 'failed',
        timelineReady: false,
        libraryAssetId: null,
        r2Key: null,
        thumbnailUrl: null,
        previewUrl: null,
      }),
      canReplaceSelectedClip: false,
    })

    try {
      expect(buttonByText(host, 'Add to timeline').disabled).toBe(true)
      expect(buttonByText(host, 'Replace selected').disabled).toBe(true)
      expect(buttonByText(host, 'Generate from asset').disabled).toBe(true)
      expect(buttonByText(host, 'Generate captions').disabled).toBe(true)
      buttonByText(host, 'Add to timeline').click()
      await nextTick()
      expect(events).toEqual([])
    } finally {
      app.unmount()
    }
  })
})
