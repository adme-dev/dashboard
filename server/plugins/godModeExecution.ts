import { registerGodModeChatMutationFamily } from '~~/server/utils/ai/godModeMutationFamily'
import { registerGodModeBannerProjectCreationFamily } from '~~/server/utils/banner/godModeProjectCreation'

registerGodModeChatMutationFamily()
registerGodModeBannerProjectCreationFamily()

export default defineNitroPlugin(() => {})
