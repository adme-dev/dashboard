import { requireWriteAccess } from '~~/server/utils/auth'
import { listAssetIntelligenceActions, listAssetIntelligenceModels } from '~~/server/utils/video-asset-intelligence/registry'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  return {
    actions: listAssetIntelligenceActions(),
    models: listAssetIntelligenceModels(),
  }
})
