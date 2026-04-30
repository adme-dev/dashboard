// server/utils/leads/destinations/email.ts
// STUB — replaced by full implementation in Plan 1a Task 16 (Resend + template rendering).
import { registerAdapter } from './index'
import type { DestinationAdapter } from './types'

const adapter: DestinationAdapter = {
  type: 'email',
  validateConfig: () => ({ valid: false, errors: { stub: 'email adapter not yet implemented (Task 16)' } }),
  dispatch: async () => ({ status: 'failed', error: 'email_adapter_stub' }),
}

registerAdapter(adapter)
export default adapter
