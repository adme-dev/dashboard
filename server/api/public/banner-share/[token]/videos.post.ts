import { prepareBannerShareVideo } from '~~/server/utils/banner/shareVideo'
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body || typeof body.formatKey !== 'string' || body.formatKey.length > 50 || (body.retry !== undefined && typeof body.retry !== 'boolean')) {
    throw createError({ statusCode: 400, statusMessage: 'Choose an artwork size' })
  }
  return prepareBannerShareVideo(event, body.formatKey, body.retry === true)
})
