import type { H3Event } from 'h3'
import { loadLead } from '~~/server/utils/leads/db'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'

export interface PodiumPostCommitPayload {
  leadId: string
  outboxEventId: string | null
}

/**
 * Post-commit side effects for a Podium lead webhook: publish the pending
 * conversion outbox event (when there is one) and notify subscribers of the
 * new lead. Extracted so it can run either via the durable job queue
 * (see queueConsumer.ts) or as the local-dev inline fallback.
 */
export async function runPodiumPostCommit(event: H3Event, payload: PodiumPostCommitPayload): Promise<void> {
  const { leadId, outboxEventId } = payload
  if (outboxEventId) {
    await conversionOutboxPublisher.publishEvent(event, outboxEventId)
  }
  const fresh = await loadLead(leadId)
  if (fresh) await notifyOnNewLead(fresh)
}
