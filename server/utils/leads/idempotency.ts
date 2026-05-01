// server/utils/leads/idempotency.ts
// Deterministic key for outbound delivery dedupe. Receivers can store this
// and reject repeats. Stable across our retries (we never regenerate it).

import { createHash } from 'node:crypto'

export function deliveryIdempotencyKey(leadId: string, destinationId: string): string {
  return createHash('md5').update(`${leadId}|${destinationId}`).digest('hex')
}
