import { bannerShareImage } from '~~/server/utils/banner/shareImage'
import { teamBannerPreviewAccess } from '~~/server/utils/banner/teamPreview'

export default defineEventHandler(event => {
  const { formatKey, index, scale, quality } = getQuery(event)
  if (typeof formatKey !== 'string' || typeof index !== 'string' || !/^\d{1,2}$/.test(index)
    || !['1', '2'].includes(String(scale)) || typeof quality !== 'string' || !/^\d{1,3}$/.test(quality)
    || Number(quality) < 1 || Number(quality) > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a size, slide, scale and JPEG quality' })
  }
  return bannerShareImage(event, teamBannerPreviewAccess(event).load, false, {
    index: Number(index), scale: Number(scale), quality: Number(quality)
  })
})
