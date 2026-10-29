import { authorizedBannerSnapshot, readBannerSnapshot } from '~~/server/utils/banner/viewerSnapshot'

export default defineEventHandler(async (event) => {
  const snapshot = await authorizedBannerSnapshot(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return await readBannerSnapshot(event, snapshot)
})
