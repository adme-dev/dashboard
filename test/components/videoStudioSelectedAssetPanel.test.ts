import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioSelectedAssetPanel from '~~/app/components/media/VideoStudioSelectedAssetPanel.vue'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled'],
    template: '<button :data-icon="icon" :disabled="disabled"><slot />{{ label }}</button>'
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
    expect(html).toContain('Generate from asset')
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

  it('renders an empty selection state', async () => {
    const html = await render({ asset: null })
    expect(html).toContain('No asset selected')
    expect(html).toContain('Pick an asset from the library')
  })
})
