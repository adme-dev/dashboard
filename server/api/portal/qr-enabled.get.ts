import { requireClientAuth } from '~~/server/utils/clientAuth'

/** Whether the portal QR generator is switched on (QR_PORTAL_ENABLED). Off by default. */
export default defineEventHandler(async (event) => {
  await requireClientAuth(event)
  return { enabled: process.env.QR_PORTAL_ENABLED === 'true' }
})
