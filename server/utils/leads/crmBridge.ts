// server/utils/leads/crmBridge.ts
// F10 bridge — log an inbound lead onto the CRM timeline when its email maps to
// an existing CRM person. The gate (CRM_COMMS_BRIDGE_ENABLED), person-lookup and
// idempotency live in bridgeCommunication(); this module just maps a lead to its
// input and fires it as a non-blocking side-effect (a failure here must never
// break lead ingestion). buildLeadBridgeInput is pure so the mapping is tested
// without a DB.

import { bridgeCommunication, type BridgeCommunicationInput } from '~~/server/utils/crm/commsDb'

export interface LeadForBridge {
  id: string
  client_id: string | null
  field_data?: Record<string, unknown> | null
  submitted_at?: string | null
}

/** Map an inbound lead to a CRM communication, or null when there's nothing to log. */
export function buildLeadBridgeInput(lead: LeadForBridge): BridgeCommunicationInput | null {
  const email = lead.field_data?.email
  if (!lead.client_id || typeof email !== 'string' || !email) return null
  return {
    clientId: lead.client_id,
    contactEmail: email,
    channel: 'note',          // an inbound form submission isn't email/call/sms
    direction: 'inbound',
    source: 'lead_bridge',
    externalId: lead.id,      // the lead's own id — unique, deterministic, present
    subject: 'New lead submission',
    body: null,
    occurredAt: lead.submitted_at ?? null,
  }
}

/** Fire-and-forget bridge for a freshly-ingested lead. Swallows errors and is a
 *  no-op when the bridge is disabled (bridgeCommunication gates on the env flag). */
export async function bridgeLeadToCrm(lead: LeadForBridge): Promise<void> {
  const input = buildLeadBridgeInput(lead)
  if (!input) return
  try {
    await bridgeCommunication(input)
  } catch (e) {
    // Never block ingestion on a CRM-timeline failure.
    console.warn('crmBridge.lead.error', e)
  }
}
