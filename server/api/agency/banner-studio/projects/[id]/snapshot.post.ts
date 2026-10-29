import { authorizedBannerSnapshot, storeBannerSnapshot } from '~~/server/utils/banner/viewerSnapshot'

export default defineEventHandler(async (event) => {
  // Read the accepted database revision, never arbitrary HTML/JSON from the browser.
  const snapshot = await authorizedBannerSnapshot(event, true)
  await storeBannerSnapshot(event, snapshot)
  setHeader(event, 'Cache-Control', 'private, no-store')
  return { revision: snapshot.revision }
})
