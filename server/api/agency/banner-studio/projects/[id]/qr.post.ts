import { getRouterParam, readBody, defineEventHandler, setHeader } from 'h3'
import { insertBannerPlatformQr } from '~~/server/utils/banner/platformQr'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  return insertBannerPlatformQr(
    event,
    getRouterParam(event, 'id'),
    await readBody(event)
  )
})
