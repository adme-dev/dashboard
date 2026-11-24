import { bannerShareImage } from '~~/server/utils/banner/shareImage'
import { teamBannerPreviewAccess } from '~~/server/utils/banner/teamPreview'

export default defineEventHandler(event => bannerShareImage(event, teamBannerPreviewAccess(event).load, getQuery(event).size === 'gallery'))
