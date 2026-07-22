import { requireAuth } from '~~/server/utils/auth'
import { getNotificationDeliveryStatus } from '~~/server/utils/notificationDelivery'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  return getNotificationDeliveryStatus()
})
