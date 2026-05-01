// server/tasks/leads-purge-retention.ts
// Nitro scheduledTask wrapper: retention purge (default 18 months).
import { execute } from '~~/server/utils/db'

export default defineTask({
  meta: { name: 'leads:purge-retention', description: 'Retention purge for terminal-state + soft-deleted' },
  async run() {
    const months = Number(process.env.LEADS_RETENTION_MONTHS ?? 18)
    const deleted = await execute(`
      DELETE FROM leads
      WHERE (
        (status IN ('won','lost','spam_suspected') AND created_at < NOW() - ($1 || ' months')::interval)
        OR (deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' months')::interval)
      )
    `, [String(months)])
    return { result: { deleted, months } }
  },
})
