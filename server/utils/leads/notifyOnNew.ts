// server/utils/leads/notifyOnNew.ts
// Surfaces a notification to the assigned AM (or the client's primary/secondary AM)
// when a lead arrives, and bridges the lead onto the CRM timeline (F10). Uses the
// existing notifications subsystem so Smart Watch / inbox / digest features all
// light up automatically. All inbound paths converge here, so it's the single
// place new-lead side-effects are wired.

import { queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { bridgeLeadToCrm } from '~~/server/utils/leads/crmBridge'
import type { Lead } from '~~/app/types'

type MinimalLead = Pick<Lead,
  'id' | 'client_id' | 'source' | 'form_id' | 'form_name' | 'assigned_to' | 'field_data' | 'submitted_at'>

export async function notifyOnNewLead(lead: MinimalLead): Promise<void> {
  // CRM timeline bridge first — independent of notification recipients, and a
  // no-op (gated + self-guarding) until the operator enables CRM_COMMS_BRIDGE_ENABLED.
  await bridgeLeadToCrm(lead)

  const f = lead.field_data ?? {}
  const summary = [f.full_name, f.email, f.phone_number ?? f.phone]
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ') || lead.id.slice(0, 8)
  const title = `New lead — ${lead.form_name || lead.source}`

  // Resolve recipients: the assigned AM if any, else the client's primary/secondary AM.
  let recipients: string[] = []
  if (lead.assigned_to) {
    recipients = [lead.assigned_to]
  } else if (lead.client_id) {
    const rows = await queryRows<{ team_member_id: string }>(`
      SELECT team_member_id FROM client_team_assignments
      WHERE client_id = $1 AND role IN ('primary_am', 'secondary_am')
    `, [lead.client_id])
    recipients = rows.map(r => r.team_member_id)
  }
  if (recipients.length === 0) return

  for (const userId of recipients) {
    try {
      await createNotification({
        userId,
        type: 'lead',
        reason: 'lead_arrived',
        title,
        message: summary,
        link: `/agency/leads?lead=${lead.id}`,
      })
    } catch (e) {
      // Never block ingestion on notification failure.
      console.warn('notifyOnNewLead.error', e)
    }
  }
}
