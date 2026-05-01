// server/tasks/leads-recover-claims.ts
// Nitro scheduledTask wrapper: reset stuck `claimed` deliveries.
import { recoverStuckClaims } from '~~/server/utils/leads/db'

export default defineTask({
  meta: { name: 'leads:recover-claims', description: 'Reset stuck claimed deliveries' },
  async run() {
    const reset = await recoverStuckClaims(5)
    return { result: { reset } }
  },
})
