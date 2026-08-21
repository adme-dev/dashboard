import { registerGodModeChatMutationFamily } from '~~/server/utils/ai/godModeMutationFamily'
import { registerGodModeBannerAssetUploadFamily } from '~~/server/utils/banner/godModeAssetUpload'
import { registerGodModeBannerProjectCreationFamily } from '~~/server/utils/banner/godModeProjectCreation'
import { registerGodModeAgencyClientMutationFamilies } from '~~/server/utils/clients/godModeMutations'
import { registerGodModeCatalogSourceMutationFamily } from '~~/server/utils/crm/catalogSourceGodMode'
import { registerGodModeGoogleConversionActionMutationFamily } from '~~/server/utils/measurement/googleConversionActionGodMode'
import { registerGodModeDealerFeedMutationFamilies } from '~~/server/utils/feeds/godModeMutations'
import { registerGodModeSocialAccountMapMutationFamily } from '~~/server/utils/social/accountMapGodMode'
import { registerGodModeSocialPublishingAccountMutationFamilies } from '~~/server/utils/social/publishingAccountGodMode'
import { registerGodModeTrackingSiteMutationFamily } from '~~/server/utils/tracking/godModeMutations'
import { prepareGodModeBannerRender } from '~~/server/utils/banner/godModeRender'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'

registerGodModeChatMutationFamily()
registerGodModeBannerAssetUploadFamily()
registerGodModeBannerProjectCreationFamily()
registerGodModeDealerFeedMutationFamilies()
registerGodModeCatalogSourceMutationFamily()
registerGodModeSocialAccountMapMutationFamily()
registerGodModeSocialPublishingAccountMutationFamilies()
registerGodModeAgencyClientMutationFamilies()
registerGodModeTrackingSiteMutationFamily()
registerGodModeGoogleConversionActionMutationFamily()
registerGodModeMutationFamily({
  family: 'banner-render-enqueue',
  method: 'POST',
  matchesPath: path => path === '/api/agency/banner-studio/export-video',
  prepare: prepareGodModeBannerRender
})

export default defineNitroPlugin(() => {})
