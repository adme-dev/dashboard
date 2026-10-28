import { createHash } from 'node:crypto'
import { createError } from 'h3'

export interface LeadAssignmentDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[], rowCount?: number | null }>
}
export interface LeadAssignmentRow {
  id: string
  client_id: string
  status: string
  assigned_to: string | null
  contacted_at: string | Date | null
  contacted_by: string | null
}
export function leadAssignmentRevision(lead: LeadAssignmentRow): string {
  return createHash('sha256').update(JSON.stringify({
    leadId: lead.id,
    clientId: lead.client_id,
    status: lead.status,
    assignedTo: lead.assigned_to,
    contactedAt: lead.contacted_at ? new Date(lead.contacted_at).toISOString() : null,
    contactedBy: lead.contacted_by
  })).digest('hex')
}
export async function assignLeadFollowup(
  db: LeadAssignmentDb,
  input: {
    clientId: string
    leadId: string
    assigneeId: string | null
    expectedRevision?: string
    scopeActiveClient?: boolean
    excludeTest?: boolean
  }
) {
  const scopeActiveClient = input.scopeActiveClient ?? true
  const excludeTest = input.excludeTest ?? true
  const result = await db.query(`SELECT l.id,l.client_id,l.status,l.assigned_to,l.contacted_at,l.contacted_by
    FROM leads l ${scopeActiveClient ? 'JOIN agency_clients c ON c.id=l.client_id AND c.is_active=TRUE' : ''}
    WHERE l.id=$1 AND l.client_id=$2 AND l.deleted_at IS NULL ${excludeTest ? 'AND l.is_test=FALSE' : ''} FOR UPDATE OF l`,
  [input.leadId, input.clientId])
  const lead = result.rows[0] as LeadAssignmentRow | undefined
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'Lead not found in active client scope' })
  const currentRevision = leadAssignmentRevision(lead)
  if (input.expectedRevision && input.expectedRevision !== currentRevision) {
    throw createError({ statusCode: 409, statusMessage: 'Lead follow-up changed since it was read' })
  }
  const previousAssigneeId = lead.assigned_to
  if (previousAssigneeId === input.assigneeId) {
    return { leadId: lead.id, previousAssigneeId, assigneeId: lead.assigned_to, revision: currentRevision, unchanged: true }
  }
  const updated = await db.query('UPDATE leads SET assigned_to=$1 WHERE id=$2 AND client_id=$3 AND deleted_at IS NULL RETURNING id,client_id,status,assigned_to,contacted_at,contacted_by',
    [input.assigneeId, input.leadId, input.clientId])
  const next = updated.rows[0] as LeadAssignmentRow | undefined
  if (!next) throw createError({ statusCode: 404, statusMessage: 'Lead not found in active client scope' })
  return {
    leadId: next.id,
    previousAssigneeId,
    assigneeId: next.assigned_to,
    revision: leadAssignmentRevision(next),
    unchanged: false
  }
}
