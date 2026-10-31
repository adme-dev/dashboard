import { deleteBannerTemplate } from '~~/server/utils/banner/deleteTemplate'

export default defineEventHandler(event => deleteBannerTemplate(event, 'html'))
