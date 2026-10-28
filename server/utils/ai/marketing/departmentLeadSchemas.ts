import { z } from 'zod'

const client = z.strictObject({ clientId: z.string().uuid() })
const revision = z.string().regex(/^[a-f0-9]{64}$/)
const lead = client.extend({ leadId: z.string().uuid() })
const proposal = client.extend({ proposalId: z.string().uuid() })
const filter = z.strictObject({
  field: z.string().trim().min(1).max(160),
  op: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty', 'in', 'not_in']),
  value: z.unknown().optional()
})
const destination = z.strictObject({
  destinationId: z.string().uuid().optional(),
  destinationType: z.string().trim().min(1).max(30),
  config: z.unknown(),
  filter: filter.nullable().optional(),
  delayMinutes: z.number().int().min(0).max(1440).default(0),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0)
})
export const departmentLeadRoutingInputSchema = client.extend({
  ruleId: z.string().uuid().optional(),
  source: z.enum(['meta', 'google', 'webhook', 'csv', 'email']),
  formId: z.string().trim().min(1).max(255),
  formName: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean(),
  destinations: z.array(destination).max(25).default([])
    .refine(rows => new Set(rows.map(row => row.destinationId).filter(Boolean)).size === rows.filter(row => row.destinationId).length, 'Duplicate destination ID')
})
export const departmentLeadContracts = [
  ['marketing_get_lead_followup', lead, false, 'Read one minimized stored lead follow-up, assignment revision, routing metadata and safe delivery states for an active client. No customer fields, notes, attribution, provider errors or payload.'],
  ['marketing_assign_lead_followup', lead.extend({ assigneeId: z.string().uuid().nullable(), expectedRevision: revision }), true, 'Assign or unassign one lead after exact revision validation. Assignees must be active staff with current authority for the same active client. Local transaction only; no status, conversion or notification effect.'],
  ['marketing_list_lead_routing_rules', client.extend({ afterId: z.string().uuid().optional(), limit: z.number().int().min(1).max(50).default(25) }), false, 'List active-client lead routing rules with minimized destination metadata, filters and config hashes. Secrets and customer payloads are excluded.'],
  ['marketing_propose_lead_routing_change', departmentLeadRoutingInputSchema, true, 'Prepare an exact full rule and destination replacement using native destination validation. Creates no delivery and does not test, fire or replay leads. Independent approval is required.'],
  ['marketing_get_lead_routing_change', proposal, false, 'Read a sanitized routing proposal, exact revision, independent review and durable local outcome as proposer or eligible peer reviewer.'],
  ['marketing_review_lead_routing_change', proposal.extend({ expectedRevision: revision, decision: z.enum(['approved', 'rejected']), reason: z.string().trim().max(1000).optional() }), true, 'Approve or reject an exact routing revision after fresh independent reviewer, proposer, active-client and unchanged-configuration checks. No rule or lead mutation occurs during review.'],
  ['marketing_execute_lead_routing_change', proposal.extend({ expectedRevision: revision, ack: z.literal(true) }), true, 'Execute one exact independently approved routing replacement and its ledger/proposal receipt in one local transaction. Affects future ingestion only; never fires, tests or replays existing leads.']
] as const
export const DEPARTMENT_LEAD_READ_NAMES: readonly string[] = departmentLeadContracts.filter(row => !row[2]).map(row => row[0])
export const DEPARTMENT_LEAD_WRITE_NAMES: readonly string[] = departmentLeadContracts.filter(row => row[2]).map(row => row[0])
export type DepartmentLeadToolName = typeof departmentLeadContracts[number][0]
