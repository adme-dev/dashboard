import type { VideoGenerationModel } from '~~/server/utils/video-generation/types'

/** Tenant-facing requests may only use active, selectable Cloudflare AI Gateway models. */
export function isTenantModel(model: VideoGenerationModel): boolean {
  return model.provider === 'aigateway'
    && model.surface === 'tenant'
    && model.defaultEnabled
    && model.safetyClass !== 'disabled'
}
