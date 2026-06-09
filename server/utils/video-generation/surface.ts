import type { VideoGenerationModel } from '~~/server/utils/video-generation/types'

/** Tenant-facing requests may only use models whose surface is not 'internal'.
 *  Models without an explicit surface are treated as tenant-facing (back-compat). */
export function isTenantModel(model: VideoGenerationModel): boolean {
  return model.surface !== 'internal'
}
