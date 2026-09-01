import { registerGodModeMediaExternalMutationFamilies } from '~~/server/utils/audio/godModeExternalMutations'
import { registerGodModeMediaProjectMutationFamilies } from '~~/server/utils/audio/godModeMutations'
import { registerGodModeStudioMutationFamilies } from '~~/server/utils/video/godModeStudioMutations'
import { registerGodModeChatMutationFamily } from '~~/server/utils/ai/godModeMutationFamily'
import { registerGodModeBannerAssetUploadFamily } from '~~/server/utils/banner/godModeAssetUpload'
import { registerGodModeBannerProjectCreationFamily } from '~~/server/utils/banner/godModeProjectCreation'
import { registerGodModeAgencyClientMutationFamilies } from '~~/server/utils/clients/godModeMutations'
import { registerGodModeCatalogSourceMutationFamily } from '~~/server/utils/crm/catalogSourceGodMode'
import { registerGodModeGoogleConversionActionMutationFamily } from '~~/server/utils/measurement/googleConversionActionGodMode'
import { registerGodModeMeasurementConfigurationMutationFamilies } from '~~/server/utils/measurement/configurationGodMode'
import { registerGodModeDealerFeedMutationFamilies } from '~~/server/utils/feeds/godModeMutations'
import { registerGodModeSocialAccountMapMutationFamily } from '~~/server/utils/social/accountMapGodMode'
import { registerGodModeGoogleProfileAccountDiscoveryMutationFamily } from '~~/server/utils/social/googleProfileAccountDiscoveryGodMode'
import { registerGodModeSocialPublishingAccountMutationFamilies } from '~~/server/utils/social/publishingAccountGodMode'
import { registerGodModeSocialInboxMutationFamilies } from '~~/server/utils/socialInbox/godModeMutations'
import { registerGodModeTrackingSiteMutationFamily } from '~~/server/utils/tracking/godModeMutations'
import { registerGodModeQrMutationFamilies } from '~~/server/utils/qr/godModeMutations'
import { registerGodModePageStudioMutationFamilies } from '~~/server/utils/pageStudio/godModeMutations'
import { registerGodModeSearchAuthorityMutationFamilies } from '~~/server/utils/searchAuthority/godModeMutations'
import { prepareGodModeBannerRender } from '~~/server/utils/banner/godModeRender'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'

registerGodModeChatMutationFamily()
registerGodModeMediaProjectMutationFamilies()
registerGodModeMediaExternalMutationFamilies()
registerGodModeStudioMutationFamilies()
registerGodModeBannerAssetUploadFamily()
registerGodModeBannerProjectCreationFamily()
registerGodModeDealerFeedMutationFamilies()
registerGodModeCatalogSourceMutationFamily()
registerGodModeSocialAccountMapMutationFamily()
registerGodModeSocialPublishingAccountMutationFamilies()
registerGodModeSocialInboxMutationFamilies()
registerGodModeAgencyClientMutationFamilies()
registerGodModeTrackingSiteMutationFamily()
registerGodModeQrMutationFamilies()
registerGodModePageStudioMutationFamilies()
registerGodModeSearchAuthorityMutationFamilies()
registerGodModeGoogleConversionActionMutationFamily()
registerGodModeMeasurementConfigurationMutationFamilies()
registerGodModeGoogleProfileAccountDiscoveryMutationFamily()
registerGodModeMutationFamily({
  family: 'banner-render-enqueue',
  method: 'POST',
  matchesPath: path => path === '/api/agency/banner-studio/export-video',
  prepare: prepareGodModeBannerRender
})

export default defineNitroPlugin(() => {})
