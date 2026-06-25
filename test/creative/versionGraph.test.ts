import { describe, expect, it } from 'vitest'
import {
  buildCreativeVersionGraph,
  favoriteVersions,
  latestVersionForRoot,
  mapAudioAssetToVersionSource,
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

  it('maps audio assets into version sources', () => {
    expect(mapAudioAssetToVersionSource({
      id: 'audio-1',
      kind: 'voiceover',
      title: 'Launch VO',
      status: 'done',
      prompt: 'Read this line',
      r2_key_master: 'audio/client/audio-1/master.mp3',
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
        kind: 'voiceover',
        prompt: 'Read this line',
        r2Key: 'audio/client/audio-1/master.mp3'
      }
    })
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
})
