import { describe, expect, it } from 'vitest'
import { resolveGeneratedClipInspector } from '~~/app/utils/video/generatedClipInspector'

describe('resolveGeneratedClipInspector', () => {
  it('returns generated asset provenance for a selected video clip', () => {
    const result = resolveGeneratedClipInspector({
      selectedClipId: 'clip-1',
      timeline: {
        tracks: [
          { id: 'video', kind: 'video', clips: [{ id: 'clip-1', type: 'video', r2_key: 'video-generation/agency/job/output.mp4', duration_sec: 5, timeline_start_sec: 2 }] },
        ],
      } as any,
      assets: [
        {
          id: 'asset-1',
          r2Key: 'video-generation/agency/job/output.mp4',
          title: 'Generated spot',
          format: '9:16',
          durationSec: 5,
          generationPrompt: 'wheels turning in sand',
          generationModelId: 'aigateway/seedance-i2v',
          sourceJobId: 'job-1',
        } as any,
      ],
    })

    expect(result).toMatchObject({
      kind: 'generated-video',
      clipId: 'clip-1',
      assetId: 'asset-1',
      title: 'Generated spot',
      prompt: 'wheels turning in sand',
      modelLabel: 'Seedance (image-to-video)',
      sourceJobId: 'job-1',
    })
  })

  it('returns empty when no clip is selected', () => {
    expect(resolveGeneratedClipInspector({ selectedClipId: null, timeline: { tracks: [] } as any, assets: [] })).toEqual({ kind: 'empty' })
  })
})
