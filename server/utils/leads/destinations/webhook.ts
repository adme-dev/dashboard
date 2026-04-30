// server/utils/leads/destinations/webhook.ts
// STUB — replaced by full implementation in Plan 1a Task 14 (TDD with SSRF defense + HMAC + idempotency).
import { registerAdapter } from './index'
import type { DestinationAdapter } from './types'

const adapter: DestinationAdapter = {
  type: 'webhook',
  validateConfig: () => ({ valid: false, errors: { stub: 'webhook adapter not yet implemented (Task 14)' } }),
  dispatch: async () => ({ status: 'failed', error: 'webhook_adapter_stub' }),
}

registerAdapter(adapter)
export default adapter
