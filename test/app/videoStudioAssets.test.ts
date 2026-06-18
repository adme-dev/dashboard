import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useVideoStudioAssets } from '~~/app/composables/useVideoStudioAssets'
import { filterVideoStudioAssets, normalizeVideoStudioAssets } from '~~/app/utils/video/videoStudioAssets'
import { audioStudioTimelinePayload } from '~~/app/utils/video/videoLibraryTimeline'

describe('videoStudioAssets', () => {
  it('normalizes mixed studio sources into one searchable asset list', () => {
    const assets = normalizeVideoStudioAssets({
      bucketItems: [{
        id: 'bucket-item-1',
        bucketId: 'bucket-generated',
        assetId: 'asset-1',
        r2Key: 'source/car.png',
        title: 'Hero car still',
        role: 'hero',
        status: 'ready',
        directive: { prompt: 'Use as opening shot' }
      }],
      videoAssets: [{
        id: 'asset-1',
        title: 'Generated drive-by',
        sourceJobId: 'job-1',
        r2Key: 'generated/drive.mp4',
        format: '9:16',
        durationSec: 5,
        thumbnailUrl: '/thumb.jpg',
        generationPrompt: 'Slow dolly past the car',
        generationModelId: 'replicate/wan-2.2'
      }],
      audioAssets: [{
        id: 'voice-1',
        title: 'Opening voiceover',
        kind: 'voiceover',
        status: 'ready',
        durationSec: 12,
        r2KeyMaster: 'audio/vo.mp3',
        streamUrl: '/vo.mp3'
      }],
      overlays: [{
        id: 'overlay-1',
        title: 'EOFY lower third',
        formatKey: 'reels_9x16',
        status: 'ready'
      }],
      generationJobs: [{
        id: 'job-2',
        status: 'running',
        mode: 'image-to-video',
        modelId: 'replicate/seedance',
        prompt: 'Smoke reveal',
        outputAssetId: null,
        outputR2Key: null,
        createdAt: '2026-06-18T00:00:00Z'
      }],
      derivatives: [{
        id: 'derivative-1',
        sourceAssetId: 'asset-1',
        kind: 'mask-png',
        r2Key: 'derivatives/mask.png',
        metadata: { title: 'Lifted badge' },
        createdAt: '2026-06-18T00:00:00Z',
        durationSec: null
      }]
    })

    expect(assets.map(asset => asset.id)).toEqual([
      'bucket:bucket-item-1',
      'video:asset-1',
      'audio:voice-1',
      'overlay:overlay-1',
      'job:job-2',
      'derivative:derivative-1'
    ])
    expect(assets.find(asset => asset.id === 'job:job-2')?.status).toBe('running')
    expect(assets.find(asset => asset.id === 'video:asset-1')?.timelineReady).toBe(true)
    expect(assets.find(asset => asset.id === 'audio:voice-1')?.previewUrl).toBe('/vo.mp3')
  })

  it('only marks completed audio assets as timeline-ready', () => {
    const assets = normalizeVideoStudioAssets({
      audioAssets: [
        {
          id: 'music-queued',
          title: 'Still rendering music',
          kind: 'music',
          status: 'rendering',
          durationSec: null,
          r2KeyMaster: 'audio/music.mp3',
          streamUrl: '/music.mp3'
        },
        {
          id: 'voice-ready',
          title: 'Ready voice',
          kind: 'voiceover',
          status: 'ready',
          durationSec: 8,
          r2KeyMaster: 'audio/voice.mp3',
          streamUrl: '/voice.mp3'
        }
      ]
    })

    expect(assets.find(asset => asset.id === 'audio:music-queued')?.timelineReady).toBe(false)
    expect(assets.find(asset => asset.id === 'audio:voice-ready')?.timelineReady).toBe(true)
  })

  it('maps only ready audio assets into timeline payloads', () => {
    expect(audioStudioTimelinePayload({
      id: 'voice-ready',
      title: 'Ready voice',
      kind: 'voiceover',
      status: 'ready',
      r2KeyMaster: 'audio/voice.mp3',
      streamUrl: '/voice.mp3'
    })).toEqual({
      id: 'voice-ready',
      r2_key_master: 'audio/voice.mp3',
      title: 'Ready voice',
      kind: 'voiceover',
      streamUrl: '/voice.mp3'
    })

    expect(audioStudioTimelinePayload({
      id: 'music-queued',
      title: 'Queued music',
      kind: 'music',
      status: 'queued',
      r2KeyMaster: 'audio/music.mp3',
      streamUrl: '/music.mp3'
    })).toBeNull()
  })

  it('filters by search, type, status, model, source, and bucket', () => {
    const assets = normalizeVideoStudioAssets({
      bucketItems: [{
        id: 'bucket-item-1',
        bucketId: 'bucket-generated',
        assetId: 'asset-1',
        r2Key: 'source/car.png',
        title: 'Hero car still',
        role: 'hero',
        status: 'ready',
        directive: { prompt: 'Use as opening shot' }
      }],
      videoAssets: [{
        id: 'asset-1',
        title: 'Generated drive-by',
        sourceJobId: 'job-1',
        r2Key: 'generated/drive.mp4',
        format: '9:16',
        durationSec: 5,
        thumbnailUrl: null,
        generationPrompt: 'Slow dolly past the car',
        generationModelId: 'replicate/wan-2.2'
      }],
      generationJobs: [{
        id: 'job-2',
        status: 'failed',
        mode: 'image-to-video',
        modelId: 'replicate/seedance',
        prompt: 'Smoke reveal',
        outputAssetId: null,
        outputR2Key: null,
        createdAt: '2026-06-18T00:00:00Z'
      }]
    })

    expect(filterVideoStudioAssets(assets, { search: 'dolly' }).map(asset => asset.id)).toEqual(['video:asset-1'])
    expect(filterVideoStudioAssets(assets, { type: 'job', status: 'failed' }).map(asset => asset.id)).toEqual(['job:job-2'])
    expect(filterVideoStudioAssets(assets, { model: 'replicate/wan-2.2' }).map(asset => asset.id)).toEqual(['video:asset-1'])
    expect(filterVideoStudioAssets(assets, { source: 'bucket', bucketId: 'bucket-generated' }).map(asset => asset.id)).toEqual(['bucket:bucket-item-1'])
  })

  it('keeps normalized assets and filters reactive through the composable', () => {
    const input = ref({
      videoAssets: [{
        id: 'asset-1',
        title: 'Generated drive-by',
        sourceJobId: 'job-1',
        r2Key: 'generated/drive.mp4',
        format: '9:16',
        durationSec: 5,
        thumbnailUrl: null,
        generationPrompt: 'Slow dolly past the car',
        generationModelId: 'replicate/wan-2.2'
      }],
      audioAssets: [{
        id: 'voice-1',
        title: 'Opening voiceover',
        kind: 'voiceover',
        status: 'ready',
        durationSec: 12,
        r2KeyMaster: 'audio/vo.mp3',
        streamUrl: '/vo.mp3'
      }]
    })
    const filters = ref({ type: 'video' as const })
    const { assets, filteredAssets } = useVideoStudioAssets(input, filters)

    expect(assets.value).toHaveLength(2)
    expect(filteredAssets.value.map(asset => asset.id)).toEqual(['video:asset-1'])

    filters.value = { type: 'audio' }
    expect(filteredAssets.value.map(asset => asset.id)).toEqual(['audio:voice-1'])
  })
})
