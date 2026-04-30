// server/tasks/leads-purge-ingestion-errors.ts
// Nitro scheduledTask wrapper: 30-day TTL on raw payload errors.
import { execute } from '~~/server/utils/db'

export default defineTask({
  meta: { name: 'leads:purge-ingestion-errors', description: '30-day TTL on raw payload errors' },
  async run() {
    const deleted = await execute(`
      DELETE FROM lead_ingestion_errors WHERE created_at < NOW() - INTERVAL '30 days'
    `)
    return { result: { deleted } }
  },
})
