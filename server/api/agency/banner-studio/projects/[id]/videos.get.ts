import { bannerShareVideos } from '~~/server/utils/banner/shareVideo'
import { teamBannerPreviewAccess } from '~~/server/utils/banner/teamPreview'

export default defineEventHandler(event => bannerShareVideos(event, teamBannerPreviewAccess(event)))
