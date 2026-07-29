// server/utils/leads/dispatch.ts
// The execution side of the queue. Used both by the companion Worker and by
// the inline-fallback path in queue.ts when CF Queues are unavailable.

import {
  loadLead, loadRuleForForm, claimDelivery, releaseClaim,
  markDelivered, markFailed, markSkipped
} from './db'
import { evaluateLead } from './rulesEngine'
import { getAdapter } from './destinations'
import { crmLeadPromotionService } from './crmPromotion'
import { queryOne } from '~~/server/utils/db'
import type { LeadDelivery, LeadRuleDestination, LeadSource } from '~~/app/types'
import type { QueueMessage } from './queue'
import {
  markCrmPromotionFailure,
  markCrmPromotionResult,
  markCrmPromotionStarted
} from './crmPromotionState'

const WORKER_ID = `inline-${Math.random().toString(36).slice(2, 10)}`
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000]

export async function handleQueueMessage(msg: QueueMessage): Promise<void> {
  if (msg.type === 'crm.promote' && msg.payload.lead_id) {
    await markCrmPromotionStarted(msg.payload.lead_id)
    try {
      const result = await crmLeadPromotionService.promote(msg.payload.lead_id)
      await markCrmPromotionResult(msg.payload.lead_id, result.status)
      console.info({
        event: 'crm_lead_promotion_completed',
        leadId: msg.payload.lead_id,
        status: result.status,
        ...('personId' in result ? { personId: result.personId } : {}),
        ...('opportunityId' in result ? { opportunityId: result.opportunityId } : {})
      })
    } catch (error) {
      await markCrmPromotionFailure(msg.payload.lead_id, error)
      throw error
    }
    return
  }
  if (msg.type === 'rules.evaluate' && msg.payload.lead_id) {
    const result = await evaluateLead(msg.payload.lead_id)
    // Each insertDelivery already wrote a row; chain a delivery.dispatch per planned id.
    const { enqueueLeadJob } = await import('./queue')
    for (const d of result.deliveries) {
      await enqueueLeadJob({
        type: 'delivery.dispatch',
        payload: { delivery_id: d.delivery_id },
        delaySeconds: d.delay_minutes * 60
      })
    }
    return
  }
  if (msg.type === 'delivery.dispatch' && msg.payload.delivery_id) {
    await dispatchOne(msg.payload.delivery_id, msg.attempt ?? 0)
    return
  }
}

async function loadDestination(id: string): Promise<LeadRuleDestination | null> {
  return queryOne<LeadRuleDestination>(
    `SELECT * FROM lead_rule_destinations WHERE id = $1`,
    [id]
  )
}

async function dispatchOne(deliveryId: string, _attempt: number): Promise<void> {
  const claimed = await claimDelivery(deliveryId, WORKER_ID)
  if (!claimed) return // someone else has it

  // Schedule check
  if (new Date(claimed.scheduled_at).getTime() > Date.now()) {
    await releaseClaim(deliveryId)
    const { enqueueLeadJob } = await import('./queue')
    const delaySeconds = Math.max(
      1,
      Math.ceil((new Date(claimed.scheduled_at).getTime() - Date.now()) / 1000)
    )
    await enqueueLeadJob({
      type: 'delivery.dispatch',
      payload: { delivery_id: deliveryId },
      delaySeconds
    })
    return
  }

  // Re-validate
  const lead = await loadLead(claimed.lead_id)
  if (!lead || lead.deleted_at || lead.status === 'spam_suspected') {
    await markSkipped(deliveryId, 'lead_invalid')
    return
  }
  const dest = claimed.rule_destination_id
    ? await loadDestination(claimed.rule_destination_id)
    : null
  if (!dest || !dest.enabled) {
    await markSkipped(deliveryId, 'destination_disabled')
    return
  }
  if (lead.form_id && lead.source !== 'manual') {
    const bundle = await loadRuleForForm(
      lead.source as Exclude<LeadSource, 'manual'>,
      lead.form_id,
      lead.client_id
    )
    if (
      !bundle
      || bundle.rule.client_id !== lead.client_id
      || dest.rule_id !== bundle.rule.id
    ) {
      await markSkipped(deliveryId, 'rule_not_authorized')
      return
    }
    if (!bundle.rule.enabled) {
      await markSkipped(deliveryId, 'rule_disabled')
      return
    }
  }

  // Dispatch
  const adapter = getAdapter(claimed.destination_type)
  if (!adapter) {
    await markFailed(
      deliveryId,
      `unknown_adapter:${claimed.destination_type}`,
      claimed.retry_count,
      true
    )
    return
  }
  const result = await adapter.dispatch(claimed as LeadDelivery, lead, dest.config)

  if (result.status === 'delivered') {
    await markDelivered(deliveryId, result.response_meta)
    return
  }

  // Failure: retry policy
  const next = claimed.retry_count + 1
  const final = next >= BACKOFF_MS.length
  await markFailed(deliveryId, result.error, next, final)
  if (final) return
  const delaySeconds = Math.ceil((result.retry_after_ms ?? BACKOFF_MS[next]!) / 1000)
  const { enqueueLeadJob } = await import('./queue')
  await enqueueLeadJob({
    type: 'delivery.dispatch',
    payload: { delivery_id: deliveryId },
    attempt: next,
    delaySeconds
  })
}
