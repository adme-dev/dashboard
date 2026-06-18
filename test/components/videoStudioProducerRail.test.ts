import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioProducerRail from '~~/app/components/media/VideoStudioProducerRail.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  USelect: { name: 'USelect', props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  UTextarea: { name: 'UTextarea', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :placeholder="placeholder" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
}

async function render(props: Record<string, unknown> = {}) {
  const app = createSSRApp({
    render: () => h(VideoStudioProducerRail, {
      projectId: 'project-1',
      assetCount: 4,
      voiceAssetCount: 1,
      overlayAssetCount: 2,
      ...props,
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VideoStudioProducerRail', () => {
  beforeEach(() => {
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  })

  it('renders selected asset context and producer controls', async () => {
    const html = await render({
      selectedAsset: {
        id: 'video:asset-1',
        rawId: 'asset-1',
        libraryAssetId: 'asset-1',
        type: 'video',
        source: 'generation',
        title: 'Generated drive-by',
        subtitle: '9:16',
        status: 'ready',
        modelId: 'replicate/wan-2.2',
        bucketId: null,
        role: null,
        prompt: null,
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
      },
    })

    expect(html).toContain('AI Producer')
    expect(html).toContain('Dealer offer')
    expect(html).toContain('Fast vertical offer cut')
    expect(html).toContain('Generated drive-by')
    expect(html).toContain('Build draft plan')
    expect(html).toContain('Brief')
    expect(html).toContain('Format')
    expect(html).toContain('Script')
    expect(html).toContain('Captions')
    expect(html).toContain('Draft plan')
    expect(html).toContain('Render')
    expect(html).toContain('Voice')
    expect(html).toContain('Overlays')
  })

  it('renders a reviewable draft plan', async () => {
    const html = await render({
      initialPlan: {
        targetFormat: 'reels_9x16',
        rationale: 'Lead with motion and finish on offer.',
        steps: [
          { type: 'place-asset', assetId: 'asset-1', r2Key: 'generated/drive.mp4', title: 'Hero drive-by', startSec: 0, durationSec: 5 },
          { type: 'caption', title: 'Offer hook', startSec: 1, durationSec: 2 },
        ],
      },
    })

    expect(html).toContain('2 proposed steps')
    expect(html).toContain('1 timeline-ready clips')
    expect(html).toContain('Lead with motion and finish on offer.')
    expect(html).toContain('Hero drive-by')
    expect(html).toContain('Apply')
  })

  it('renders recent generation jobs in producer context', async () => {
    const html = await render({
      recentGenerationJobs: [
        {
          id: 'job-1',
          status: 'running',
          mode: 'image-to-video',
          modelId: 'aigateway/seedance-i2v',
          prompt: 'Smoke reveal hero clip',
          sourceAssetIds: ['asset-1'],
          durationSeconds: 5,
          aspectRatio: '9:16',
          resolution: null,
          subjectType: 'vehicle',
          outputAssetId: null,
          outputR2Key: null,
          errorMessage: null,
          createdAt: '2026-06-18T05:00:00.000Z',
          startedAt: '2026-06-18T05:00:01.000Z',
          completedAt: null,
        },
        {
          id: 'job-2',
          status: 'succeeded',
          mode: 'text-to-video',
          modelId: 'aigateway/wan-t2v',
          prompt: 'Night showroom pass',
          sourceAssetIds: [],
          durationSeconds: 5,
          aspectRatio: '16:9',
          resolution: '720p',
          subjectType: 'non_vehicle',
          outputAssetId: 'asset-2',
          outputR2Key: 'generated/night.mp4',
          errorMessage: null,
          createdAt: '2026-06-18T04:00:00.000Z',
          startedAt: '2026-06-18T04:00:01.000Z',
          completedAt: '2026-06-18T04:00:20.000Z',
        },
      ],
    })

    expect(html).toContain('Recent generations')
    expect(html).toContain('Smoke reveal hero clip')
    expect(html).toContain('Night showroom pass')
    expect(html).toContain('running')
    expect(html).toContain('succeeded')
  })
})
