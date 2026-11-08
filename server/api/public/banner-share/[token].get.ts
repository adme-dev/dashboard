import { loadPublicBannerShare } from '~~/server/utils/banner/publicShare'
import { publicBannerShareVideos } from '~~/server/utils/banner/shareVideo'

/** Public, view-only canvas. Preview tokens cannot read or write review comments. */
export default defineEventHandler(async (event) => {
  const share = await loadPublicBannerShare(event)
  return { ...share, ...await publicBannerShareVideos(share, getRouterParam(event, 'token')!) }
})
