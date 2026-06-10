import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import { modelLabelFor } from '~~/app/utils/video/modelPresentation'

export interface GeneratedClipAsset {
  id: string
  r2Key: string
  title: string | null
  format: string | null
  durationSec: number | null
  generationPrompt: string | null
  generationModelId: string | null
  sourceJobId: string | null
}

export type GeneratedClipInspectorState =
  | { kind: 'empty' }
  | { kind: 'missing-asset'; clipId: string; r2Key: string; durationSec: number | null }
  | {
      kind: 'generated-video'
      clipId: string
      r2Key: string
      assetId: string
      title: string
      format: string | null
      durationSec: number | null
      prompt: string | null
      modelId: string | null
      modelLabel: string
      sourceJobId: string | null
    }

export function resolveGeneratedClipInspector(input: {
  selectedClipId: string | null
  timeline: TimelineState | null
  assets: GeneratedClipAsset[]
}): GeneratedClipInspectorState {
  if (!input.selectedClipId || !input.timeline) return { kind: 'empty' }
  for (const track of input.timeline.tracks) {
    for (const clip of track.clips as any[]) {
      if (clip.id !== input.selectedClipId || clip.type !== 'video' || !clip.r2_key) continue
      const r2Key = String(clip.r2_key)
      const asset = input.assets.find((candidate) => candidate.r2Key === r2Key)
      if (!asset) {
        return { kind: 'missing-asset', clipId: clip.id, r2Key, durationSec: clip.duration_sec ?? null }
      }
      return {
        kind: 'generated-video',
        clipId: clip.id,
        r2Key,
        assetId: asset.id,
        title: asset.title ?? 'Untitled',
        format: asset.format ?? null,
        durationSec: asset.durationSec ?? clip.duration_sec ?? null,
        prompt: asset.generationPrompt ?? null,
        modelId: asset.generationModelId ?? null,
        modelLabel: modelLabelFor(asset.generationModelId),
        sourceJobId: asset.sourceJobId ?? null,
      }
    }
  }
  return { kind: 'empty' }
}
