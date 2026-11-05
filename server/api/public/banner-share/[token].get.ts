import { loadPublicBannerShare } from '~~/server/utils/banner/publicShare'

/** Public, view-only canvas. Preview tokens cannot read or write review comments. */
export default defineEventHandler(loadPublicBannerShare)
