import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioLibraryRail from '~~/app/components/media/VideoStudioLibraryRail.vue'
import type { VideoStudioAsset } from '~~/app/utils/video/videoStudioAssets'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UInput: { name: 'UInput', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<input :value="modelValue" :placeholder="placeholder" />' },
  USelect: { name: 'USelect', props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  USkeleton: { name: 'USkeleton', template: '<div />' }
}

function asset(overrides: Partial<VideoStudioAsset>): VideoStudioAsset {
  return {
    id: 'video:asset-1',
    rawId: 'asset-1',
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

describe('VideoStudioLibraryRail', () => {
  it('renders mixed assets with status, metadata, and add actions', async () => {
    const html = await render({
      assets: [
        asset({ id: 'video:asset-1', title: 'Generated drive-by', durationSec: 5 }),
        asset({ id: 'audio:voice-1', rawId: 'voice-1', type: 'audio', source: 'audio', title: 'Opening voiceover', subtitle: 'voiceover', role: 'voiceover', modelId: null, durationSec: 12, previewUrl: '/voice.mp3' }),
        asset({ id: 'audio:music-1', rawId: 'music-1', type: 'audio', source: 'audio', title: 'Queued music bed', subtitle: 'music', role: 'music', modelId: null, status: 'rendering', durationSec: null, timelineReady: false, previewUrl: '/music.mp3' }),
        asset({ id: 'job:job-1', rawId: 'job-1', type: 'job', source: 'generation', title: 'Smoke reveal', subtitle: 'image-to-video', status: 'running', timelineReady: false, r2Key: null, previewUrl: null }),
      ],
      selectedId: null,
      loading: false
    })

    expect(html).toContain('Generated drive-by')
    expect(html).toContain('Opening voiceover')
    expect(html).toContain('Queued music bed')
    expect(html).toContain('Smoke reveal')
    expect(html).toContain('running')
    expect(html).toContain('rendering')
    expect(html).toContain('5s')
    expect(html).toContain('12s')
    expect(html).toContain('Add')
    expect(html).toContain('Generating')
    expect(html).toContain('/voice.mp3')
  })

  it('renders an empty state when no assets are available', async () => {
    const html = await render({ assets: [], selectedId: null, loading: false })
    expect(html).toContain('No assets match')
  })
})
