import { registerGodModeChatMutationFamily } from '~~/server/utils/ai/godModeMutationFamily'
import { registerGodModeBannerAssetUploadFamily } from '~~/server/utils/banner/godModeAssetUpload'
import { registerGodModeBannerProjectCreationFamily } from '~~/server/utils/banner/godModeProjectCreation'
import { registerGodModeDealerFeedMutationFamilies } from '~~/server/utils/feeds/godModeMutations'
import { prepareGodModeBannerRender } from '~~/server/utils/banner/godModeRender'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'

registerGodModeChatMutationFamily()
registerGodModeBannerAssetUploadFamily()
registerGodModeBannerProjectCreationFamily()
registerGodModeDealerFeedMutationFamilies()
registerGodModeMutationFamily({
  family: 'banner-render-enqueue',
  method: 'POST',
  matchesPath: path => path === '/api/agency/banner-studio/export-video',
  prepare: prepareGodModeBannerRender
})

export default defineNitroPlugin(() => {})
