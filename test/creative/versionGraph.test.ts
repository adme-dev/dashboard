import { describe, expect, it } from 'vitest'
import {
  buildCreativeVersionGraph,
  favoriteVersions,
  latestVersionForRoot,
  mapAudioAssetToVersionSource,
  mapMediaRenderJobToVersionSource,
  mapVideoGenerationJobToVersionSource
} from '~~/server/utils/creative/versionGraph'

describe('creative version graph', () => {
  it('builds deterministic roots, depths, and child relationships', () => {
    const graph = buildCreativeVersionGraph([
      {
        id: 'export-1',
        assetType: 'render',
        versionKind: 'platform_export',
        status: 'ready',
        sourceRef: { source: 'media_render_jobs', id: 'job-1' },
        parentIds: ['take-1'],
        label: 'TikTok export',
        createdAt: '2026-06-26T10:02:00.000Z'
      },
      {
        id: 'original-1',
        assetType: 'video',
        versionKind: 'original',
        status: 'ready',
        sourceRef: { source: 'video_assets', id: 'asset-1' },
        parentIds: [],
        label: 'Original',
        createdAt: '2026-06-26T10:00:00.000Z'
      },
      {
        id: 'take-1',
        assetType: 'video',
        versionKind: 'take',
        status: 'ready',
        sourceRef: { source: 'video_generation_jobs', id: 'job-2' },
        parentIds: ['original-1'],
        label: 'Take 2',
        createdAt: '2026-06-26T10:01:00.000Z'
      }
    ])

    expect(graph.findings).toEqual([])
    expect(graph.roots).toEqual(['original-1'])
    expect(graph.nodesById['original-1'].rootId).toBe('original-1')
    expect(graph.nodesById['take-1'].rootId).toBe('original-1')
    expect(graph.nodesById['export-1'].rootId).toBe('original-1')
    expect(graph.nodesById['original-1'].lineageDepth).toBe(0)
    expect(graph.nodesById['take-1'].lineageDepth).toBe(1)
    expect(graph.nodesById['export-1'].lineageDepth).toBe(2)
    expect(graph.childrenById['original-1'].map(node => node.id)).toEqual(['take-1'])
    expect(graph.childrenById['take-1'].map(node => node.id)).toEqual(['export-1'])
  })

  it('reports missing parents without losing the orphaned node', () => {
    const graph = buildCreativeVersionGraph([
      {
        id: 'orphan',
        assetType: 'audio',
        versionKind: 'take',
        status: 'ready',
        sourceRef: { source: 'audio_assets', id: 'audio-1' },
        parentIds: ['missing-parent'],
        label: 'Orphaned take',
        createdAt: '2026-06-26T10:00:00.000Z'
      }
    ])

    expect(graph.findings).toEqual([
      {
        code: 'missing_parent',
        severity: 'warning',
        nodeId: 'orphan',
        parentId: 'missing-parent',
        message: 'Version orphan references missing parent missing-parent.'
      }
    ])
    expect(graph.nodesById.orphan.rootId).toBe('orphan')
    expect(graph.nodesById.orphan.lineageDepth).toBe(0)
    expect(graph.roots).toEqual(['orphan'])
  })

  it('reports cycles and keeps affected nodes self-rooted', () => {
    const graph = buildCreativeVersionGraph([
      {
        id: 'a',
        assetType: 'video',
        versionKind: 'take',
        status: 'ready',
        sourceRef: { source: 'video_assets', id: 'a' },
        parentIds: ['b'],
        label: 'A',
        createdAt: '2026-06-26T10:00:00.000Z'
      },
      {
        id: 'b',
        assetType: 'video',
        versionKind: 'take',
        status: 'ready',
        sourceRef: { source: 'video_assets', id: 'b' },
        parentIds: ['a'],
        label: 'B',
        createdAt: '2026-06-26T10:01:00.000Z'
      }
    ])

    expect(graph.findings).toEqual([
      {
        code: 'cycle',
        severity: 'error',
        nodeId: 'a',
        message: 'Version graph cycle detected at a.'
      },
      {
        code: 'cycle',
        severity: 'error',
        nodeId: 'b',
        message: 'Version graph cycle detected at b.'
      }
    ])
    expect(graph.nodesById.a.rootId).toBe('a')
    expect(graph.nodesById.b.rootId).toBe('b')
    expect(graph.roots).toEqual(['a', 'b'])
  })

  it('selects the newest non-failed latest version for a root', () => {
    const graph = buildCreativeVersionGraph([
      {
        id: 'root',
        assetType: 'audio',
        versionKind: 'original',
        status: 'ready',
        sourceRef: { source: 'audio_assets', id: 'root' },
        parentIds: [],
        label: 'Root',
        createdAt: '2026-06-26T10:00:00.000Z'
      },
      {
        id: 'failed-newer',
        assetType: 'audio',
        versionKind: 'take',
        status: 'failed',
        sourceRef: { source: 'audio_assets', id: 'failed-newer' },
        parentIds: ['root'],
        label: 'Failed take',
        createdAt: '2026-06-26T10:03:00.000Z'
      },
      {
        id: 'ready-older',
        assetType: 'audio',
        versionKind: 'take',
        status: 'ready',
        sourceRef: { source: 'audio_assets', id: 'ready-older' },
        parentIds: ['root'],
        label: 'Ready take',
        createdAt: '2026-06-26T10:02:00.000Z'
      }
    ])

    expect(latestVersionForRoot(graph, 'root')?.id).toBe('ready-older')
  })

  it('falls back to failed latest when every candidate is failed or blocked', () => {
    const graph = buildCreativeVersionGraph([
      {
        id: 'root',
        assetType: 'audio',
        versionKind: 'original',
        status: 'failed',
        sourceRef: { source: 'audio_assets', id: 'root' },
        parentIds: [],
        label: 'Root',
        createdAt: '2026-06-26T10:00:00.000Z'
      },
      {
        id: 'blocked-newer',
        assetType: 'audio',
        versionKind: 'take',
        status: 'blocked',
        sourceRef: { source: 'audio_assets', id: 'blocked-newer' },
        parentIds: ['root'],
        label: 'Blocked take',
        createdAt: '2026-06-26T10:02:00.000Z'
      }
    ])

    expect(latestVersionForRoot(graph, 'root')?.id).toBe('blocked-newer')
  })

  it('returns favorite versions newest first', () => {
    const graph = buildCreativeVersionGraph([
      {
        id: 'older',
        assetType: 'banner',
        versionKind: 'render',
        status: 'ready',
        sourceRef: { source: 'banner_render_jobs', id: 'older' },
        parentIds: [],
        label: 'Older',
        favorite: true,
        createdAt: '2026-06-26T10:00:00.000Z'
      },
      {
        id: 'ignored',
        assetType: 'banner',
        versionKind: 'render',
        status: 'ready',
        sourceRef: { source: 'banner_render_jobs', id: 'ignored' },
        parentIds: [],
        label: 'Ignored',
        favorite: false,
        createdAt: '2026-06-26T10:02:00.000Z'
      },
      {
        id: 'newer',
        assetType: 'banner',
        versionKind: 'render',
        status: 'ready',
        sourceRef: { source: 'banner_render_jobs', id: 'newer' },
        parentIds: [],
        label: 'Newer',
        favorite: true,
        createdAt: '2026-06-26T10:01:00.000Z'
      }
    ])

    expect(favoriteVersions(graph).map(node => node.id)).toEqual(['newer', 'older'])
  })

  it('maps voiceover audio assets into version sources with creative metadata', () => {
    expect(mapAudioAssetToVersionSource({
      id: 'audio-1',
      client_id: 'client-1',
      created_by: 'user-1',
      kind: 'voiceover',
      title: 'Launch VO',
      status: 'done',
      prompt: 'Read this line',
      lang: 'en-AU',
      voice: 'alloy',
      channels: ['tiktok', 'meta'],
      r2_key_master: 'audio/client/audio-1/master.mp3',
      variants: { tiktok: 'audio/client/audio-1/tiktok.mp3' },
      duration_sec: '8.5',
      cost_cents: 7,
      created_at: '2026-06-26T10:00:00.000Z'
    })).toEqual({
      id: 'audio:audio-1',
      assetType: 'audio',
      versionKind: 'original',
      status: 'ready',
      sourceRef: { source: 'audio_assets', id: 'audio-1' },
      parentIds: [],
      label: 'Launch VO',
      createdAt: '2026-06-26T10:00:00.000Z',
      metadata: {
        channels: ['tiktok', 'meta'],
        clientId: 'client-1',
        costCents: 7,
        createdBy: 'user-1',
        durationSec: 8.5,
        error: null,
        format: null,
        isInstrumental: null,
        kind: 'voiceover',
        lang: 'en-AU',
        lyrics: null,
        prompt: 'Read this line',
        r2Key: 'audio/client/audio-1/master.mp3',
        variants: { tiktok: 'audio/client/audio-1/tiktok.mp3' },
        voice: 'alloy'
      }
    })
  })

  it('maps music audio asset statuses and metadata into version sources', () => {
    expect([
      mapAudioAssetToVersionSource({
        id: 'music-queued',
        kind: 'music',
        status: 'queued',
        prompt: 'Warm acoustic bed',
        is_instrumental: true,
        lyrics: null,
        format: 'mp3',
        channels: ['radio'],
        created_at: '2026-06-26T10:00:00.000Z'
      }),
      mapAudioAssetToVersionSource({
        id: 'music-rendering',
        kind: 'music',
        status: 'rendering',
        prompt: 'Energetic synthwave',
        is_instrumental: false,
        lyrics: 'Drive away today',
        format: 'wav',
        channels: [],
        created_at: '2026-06-26T10:01:00.000Z'
      }),
      mapAudioAssetToVersionSource({
        id: 'music-failed',
        kind: 'music',
        status: 'failed',
        prompt: 'Cinematic launch',
        error: 'model returned no audio',
        created_at: '2026-06-26T10:02:00.000Z'
      })
    ]).toMatchObject([
      {
        id: 'audio:music-queued',
        status: 'queued',
        label: 'Music asset',
        metadata: {
          channels: ['radio'],
          format: 'mp3',
          isInstrumental: true,
          kind: 'music',
          lyrics: null,
          prompt: 'Warm acoustic bed'
        }
      },
      {
        id: 'audio:music-rendering',
        status: 'running',
        metadata: {
          format: 'wav',
          isInstrumental: false,
          lyrics: 'Drive away today'
        }
      },
      {
        id: 'audio:music-failed',
        status: 'failed',
        metadata: {
          error: 'model returned no audio',
          kind: 'music'
        }
      }
    ])
  })

  it('maps video generation jobs into version sources', () => {
    expect(mapVideoGenerationJobToVersionSource({
      id: 'job-1',
      status: 'succeeded',
      mode: 'image-to-video',
      model_id: 'model-a',
      provider: 'cloudflare',
      prompt: 'Slow dealership hero pan',
      output_asset_id: 'asset-1',
      output_r2_key: 'video/client/asset-1/master.mp4',
      source_asset_ids: ['source-1'],
      created_at: '2026-06-26T10:00:00.000Z'
    })).toEqual({
      id: 'video-generation:job-1',
      assetType: 'video',
      versionKind: 'original',
      status: 'ready',
      sourceRef: { source: 'video_generation_jobs', id: 'job-1' },
      parentIds: [],
      label: 'Slow dealership hero pan',
      createdAt: '2026-06-26T10:00:00.000Z',
      metadata: {
        mode: 'image-to-video',
        modelId: 'model-a',
        outputAssetId: 'asset-1',
        outputR2Key: 'video/client/asset-1/master.mp4',
        provider: 'cloudflare',
        sourceAssetIds: ['source-1']
      }
    })
  })

  it('maps media render jobs into render version sources', () => {
    expect(mapMediaRenderJobToVersionSource({
      id: 'render-1',
      timelineId: 'timeline-2',
      projectId: 'project-1',
      channels: ['video'],
      status: 'done',
      variants: { reels_9x16: 'renders/reels.mp4' },
      costCents: 14,
      error: null,
      requestedBy: 'user-1',
      createdAt: '2026-06-26T10:00:00.000Z',
      updatedAt: '2026-06-26T10:02:00.000Z'
    })).toEqual({
      id: 'media-render:render-1',
      assetType: 'render',
      versionKind: 'render',
      status: 'ready',
      sourceRef: { source: 'media_render_jobs', id: 'render-1' },
      parentIds: ['timeline:timeline-2'],
      label: 'Render reels_9x16',
      createdAt: '2026-06-26T10:00:00.000Z',
      metadata: {
        channels: ['video'],
        costCents: 14,
        projectId: 'project-1',
        requestedBy: 'user-1',
        timelineId: 'timeline-2',
        variants: { reels_9x16: 'renders/reels.mp4' }
      }
    })
  })

  it('keeps failed render jobs out of latest selection when a ready render exists', () => {
    const graph = buildCreativeVersionGraph([
      {
        id: 'timeline:timeline-2',
        assetType: 'video',
        versionKind: 'original',
        status: 'ready',
        sourceRef: { source: 'media_timelines', id: 'timeline-2' },
        parentIds: [],
        label: 'Timeline',
        createdAt: '2026-06-26T09:00:00.000Z'
      },
      mapMediaRenderJobToVersionSource({
        id: 'ready-render',
        timelineId: 'timeline-2',
        status: 'done',
        variants: { reels_9x16: 'renders/ready.mp4' },
        createdAt: '2026-06-26T10:00:00.000Z'
      }),
      mapMediaRenderJobToVersionSource({
        id: 'failed-render',
        timelineId: 'timeline-2',
        status: 'failed',
        variants: {},
        createdAt: '2026-06-26T10:01:00.000Z'
      })
    ])

    expect(latestVersionForRoot(graph, 'timeline:timeline-2')?.id).toBe('media-render:ready-render')
  })
})
