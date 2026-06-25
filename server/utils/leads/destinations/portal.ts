// server/utils/leads/destinations/portal.ts
import { registerAdapter } from './registry'
import type { DestinationAdapter } from './types'

const adapter: DestinationAdapter = {
  type: 'portal',
  validateConfig: () => ({ valid: true }),
  // The portal adapter is a no-op at dispatch time. The lead is already in DB
  // and visible in the agency Inbox; the existence of a `portal` destination
  // in the rule is what makes it visible in the client portal (queried at read time).
  dispatch: async () => ({ status: 'delivered', response_meta: { type: 'portal' } }),
}

registerAdapter(adapter)
export default adapter
