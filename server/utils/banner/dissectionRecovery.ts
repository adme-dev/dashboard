import type { H3Event } from 'h3'
import { getQueue } from '~~/server/utils/queue'
import { claimDissectionDispatchBatch, dissectionRecoveryLimit, expireDissectionRecoveryBatch } from '~~/server/utils/banner/dissectionJobs'
import { sendDissectionDispatch } from '~~/server/utils/banner/dissectionDispatch'

/** Recovery is transport-only: no provider retry, inline executor, or unknown legacy adoption. */
export async function recoverDissectionDispatches(event: H3Event, options: { limit?: number } = {}) {
  if (!getQueue(event)) return { ran: false as const, reason: 'queue_unavailable' as const }
  const limit = dissectionRecoveryLimit(options.limit)
  const expired = await expireDissectionRecoveryBatch(limit)
  const leased = await claimDissectionDispatchBatch(limit)
  let acknowledged = 0
  let uncertain = 0
  for (const row of leased) {
    try {
      if (await sendDissectionDispatch(event, row) === 'acknowledged') acknowledged++
      else uncertain++
    } catch {
      // A lost response never causes a generation change or unbounded immediate retry.
      uncertain++
    }
  }
  return { ran: true as const, expired: expired.length, leased: leased.length, acknowledged, uncertain }
}
