// server/utils/leads/destinations/assignUser.ts
import { registerAdapter } from './registry'
import { execute } from '~~/server/utils/db'
import type { DestinationAdapter } from './types'

interface Cfg { user_id: string }

const adapter: DestinationAdapter<Cfg> = {
  type: 'assign_user',
  validateConfig(config) {
    const c = config as Cfg
    if (!c?.user_id || typeof c.user_id !== 'string') {
      return { valid: false, errors: { user_id: 'Required' } }
    }
    return { valid: true }
  },
  async dispatch(_delivery, lead, config) {
    const updated = await execute(
      `UPDATE leads SET assigned_to = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [lead.id, config.user_id],
    )
    return updated > 0
      ? { status: 'delivered', response_meta: { user_id: config.user_id } }
      : { status: 'failed', error: 'lead_not_updatable' }
  },
}

registerAdapter(adapter)
export default adapter
