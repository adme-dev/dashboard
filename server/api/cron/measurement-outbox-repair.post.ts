import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'

export default defineEventHandler(async (event) => {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret || getHeader(event, 'x-cron-secret') !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const [outbox, deliveries] = await Promise.all([
    conversionOutboxPublisher.repairPending(event, 100),
    conversionOutboxPublisher.repairDueDeliveries(event, 100)
  ])
  return {
    ran: outbox.status === 'processed' && deliveries.status === 'processed',
    outbox,
    deliveries
  }
})
