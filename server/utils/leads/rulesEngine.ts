// server/utils/leads/rulesEngine.ts
import {
  loadLead, loadRuleForForm, insertDelivery, insertCancelledPlaceholder
} from './db'
import { evaluateFilter } from './filterEval'
import { deliveryIdempotencyKey } from './idempotency'
import type { LeadSource } from '~~/app/types'

export interface PlannedDelivery {
  delivery_id: string
  destination_id: string
  destination_type: string
  scheduled_at: string
  delay_minutes: number
}

export async function evaluateLead(
  leadId: string
): Promise<{ leadId: string, deliveries: PlannedDelivery[] }> {
  const lead = await loadLead(leadId)
  if (!lead) return { leadId, deliveries: [] }

  if (lead.source === 'manual' || !lead.form_id) {
    // Manual leads and leads without a form skip rules entirely.
    return { leadId, deliveries: [] }
  }

  const bundle = await loadRuleForForm(lead.source as Exclude<LeadSource, 'manual'>, lead.form_id)
  if (!bundle) {
    await insertCancelledPlaceholder(leadId, 'no_rule_configured')
    return { leadId, deliveries: [] }
  }
  if (!bundle.rule.enabled) {
    await insertCancelledPlaceholder(leadId, 'rule_disabled')
    return { leadId, deliveries: [] }
  }

  const planned: PlannedDelivery[] = []
  for (const dest of bundle.destinations) {
    if (!evaluateFilter(lead, dest.filter)) continue
    const scheduledAt = new Date(Date.now() + dest.delay_minutes * 60_000).toISOString()
    const key = deliveryIdempotencyKey(lead.id, dest.id)
    const id = await insertDelivery({
      lead_id: lead.id,
      rule_destination_id: dest.id,
      destination_type: dest.destination_type,
      scheduled_at: scheduledAt,
      idempotency_key: key
    })
    planned.push({
      delivery_id: id,
      destination_id: dest.id,
      destination_type: dest.destination_type,
      scheduled_at: scheduledAt,
      delay_minutes: dest.delay_minutes
    })
  }
  return { leadId, deliveries: planned }
}
