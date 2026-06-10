import { loadSourceAssetsByIds } from '~~/server/utils/video-generation/sourceAssetStore'
import type { VideoGenerationSourceAsset, VideoGenerationSubjectType } from '~~/server/utils/video-generation/types'

// Load the requested source assets from video_gen_source_assets (the approval-gated
// table the upload + from-asset endpoints write to) so compliance sees real approval
// status + subject type. (Previously queried video_assets and hardcoded approved/vehicle,
// which made every i2v request fail compliance as "missing_approved_asset".)
export async function loadVideoGenerationSourceAssets(ids: string[]): Promise<VideoGenerationSourceAsset[]> {
  if (ids.length === 0) return []
  const rows = await loadSourceAssetsByIds(ids)
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => {
    const row = byId.get(id)
    return {
      id,
      approved: row?.status === 'approved',
      subjectType: (row?.subject_type as VideoGenerationSubjectType) ?? 'unknown',
    }
  })
}
