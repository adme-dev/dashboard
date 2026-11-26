import { loadPublicBannerShare } from '~~/server/utils/banner/publicShare'
import { bannerClientPreviewDocuments, publicBannerShareVideos } from '~~/server/utils/banner/shareVideo'

/** Public, view-only canvas. Preview tokens cannot read or write review comments. */
export default defineEventHandler(async (event) => {
  const share = await loadPublicBannerShare(event)
  const previewDocuments = bannerClientPreviewDocuments(share)
  if (previewDocuments) return { ...share, previewDocuments, videos: [] }
  return { ...share, ...await publicBannerShareVideos(share, getRouterParam(event, 'token')!) }
})
