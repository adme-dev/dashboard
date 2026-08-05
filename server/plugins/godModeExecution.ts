import { registerGodModeChatMutationFamily } from '~~/server/utils/ai/godModeMutationFamily'
import { registerGodModeBannerAssetUploadFamily } from '~~/server/utils/banner/godModeAssetUpload'
import { registerGodModeBannerProjectCreationFamily } from '~~/server/utils/banner/godModeProjectCreation'

registerGodModeChatMutationFamily()
registerGodModeBannerAssetUploadFamily()
registerGodModeBannerProjectCreationFamily()

export default defineNitroPlugin(() => {})
