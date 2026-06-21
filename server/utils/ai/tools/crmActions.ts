import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'
import { pickByExactName, type NamedRef } from './createTask'

/**
 * Sales / CRM write + draft tools (PRD §7 Sales). All CRM data is client-scoped; every resolver filters
 * by the resolved client_id and `deleted_at IS NULL`, and the model never supplies a raw id. Writes are
 * Option B (propose→confirm); draft_followup is read-only (generates text, persists nothing).
 */

const ilike = (name: string) => `%${escapeLike(name)}%`

export type CrmDeps = {
  resolveClient: (name: string) => Promise<NamedRef[]>
  resolveStage: (clientId: string, name: string) => Promise<NamedRef[]>
  resolvePerson: (clientId: string, name: string) => Promise<NamedRef[]>
  resolveCompany: (clientId: string, name: string) => Promise<NamedRef[]>
  resolveOpportunity: (clientId: string, name: string) => Promise<NamedRef[]>
  propose: (ctx: ToolContext, toolName: string, payload: unknown) => Promise<string>
  draftFollowup: (clientId: string, opportunityId: string, ctx: ToolContext) => Promise<string>
}

const defaultDeps: CrmDeps = {
  resolveClient: (name) =>
    queryRows<NamedRef>(`SELECT id, name FROM agency_clients WHERE name ILIKE $1 AND is_active = true ORDER BY (lower(name)=lower($2)) DESC, name LIMIT 6`, [ilike(name), name]),
  // Stages are global (client_id IS NULL) or per-client; match either, prefer an exact name.
  resolveStage: (clientId, name) =>
    queryRows<NamedRef>(`SELECT id, name FROM crm_stages WHERE name ILIKE $1 AND (client_id IS NULL OR client_id = $2) ORDER BY (lower(name)=lower($3)) DESC LIMIT 6`, [ilike(name), clientId, name]),
  resolvePerson: (clientId, name) =>
    queryRows<NamedRef>(`SELECT id, trim(first_name || ' ' || COALESCE(last_name,'')) AS name FROM crm_people WHERE client_id = $1 AND deleted_at IS NULL AND trim(first_name || ' ' || COALESCE(last_name,'')) ILIKE $2 ORDER BY name LIMIT 6`, [clientId, ilike(name)]),
  resolveCompany: (clientId, name) =>
    queryRows<NamedRef>(`SELECT id, name FROM crm_companies WHERE client_id = $1 AND deleted_at IS NULL AND name ILIKE $2 ORDER BY (lower(name)=lower($3)) DESC, name LIMIT 6`, [clientId, ilike(name), name]),
  resolveOpportunity: (clientId, name) =>
    queryRows<NamedRef>(`SELECT id, name FROM crm_opportunities WHERE client_id = $1 AND deleted_at IS NULL AND name ILIKE $2 ORDER BY (lower(name)=lower($3)) DESC, created_at DESC LIMIT 6`, [clientId, ilike(name), name]),
  propose: (ctx, toolName, payload) => proposeAction(ctx, ctx.conversationId ?? null, toolName, payload),
  draftFollowup: async (clientId, opportunityId, ctx) => {
    const r: any = await $fetch('/api/crm/ai/draft-followup', { method: 'POST', body: { client_id: clientId, opportunity_id: opportunityId }, headers: ctx.event.headers as any })
    return typeof r?.draft === 'string' ? r.draft : ''
  },
}

function preflight(ctx: ToolContext): ToolResult | null {
  if (isReadOnlyRole(ctx.userRole)) return fail('You do not have permission to make this change.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare this action outside a conversation.')
  return null
}

function one<T extends NamedRef>(matches: T[], name: string, field: string, none: string): { one: T } | { result: ToolResult } {
  const picked = pickByExactName(matches, name)
  if (picked.length === 0) return { result: fail(none) }
  if (picked.length > 1) return { result: ok({ disambiguation: { field, options: picked } }) }
  return { one: picked[0]! }
}

// ---------- propose_opportunity ----------
const oppParams = z.object({
  clientName: z.string(),
  name: z.string(),
  stageName: z.string().default('new'),
  amount: z.number().optional(),
  personName: z.string().optional(),
})
type OppArgs = z.infer<typeof oppParams>

export async function proposeOpportunity(args: OppArgs, ctx: ToolContext, deps: CrmDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx); if (pre) return pre
  if (!args.name?.trim()) return fail('An opportunity needs a name.')
  const client = one(await deps.resolveClient(args.clientName), args.clientName, 'clientName', `No client matching "${args.clientName}".`)
  if ('result' in client) return client.result
  const stage = one(await deps.resolveStage(client.one.id, args.stageName), args.stageName, 'stageName', `No pipeline stage matching "${args.stageName}".`)
  if ('result' in stage) return stage.result
  let person: NamedRef | null = null
  if (args.personName) {
    const p = one(await deps.resolvePerson(client.one.id, args.personName), args.personName, 'personName', `No contact matching "${args.personName}".`)
    if ('result' in p) return p.result
    person = p.one
  }
  const resolved = {
    client_id: client.one.id, clientName: client.one.name, name: args.name.trim(),
    stage_id: stage.one.id, stageName: stage.one.name,
    amount: typeof args.amount === 'number' ? args.amount : 0,
    person_id: person?.id ?? null, personName: person?.name ?? null,
  }
  return ok({ proposalId: await deps.propose(ctx, 'propose_opportunity', resolved), resolved })
}

export const opportunityTool: AiTool<OppArgs> = {
  name: 'propose_opportunity',
  description: 'PROPOSE creating a CRM opportunity (a sales deal) for a client. Does NOT create anything — prepares a '
    + 'proposal the user confirms. Give the client name and the opportunity name; optionally a pipeline stage '
    + '(default "new"), an amount, and a contact name. If the result has a `disambiguation`, ask the user to pick. '
    + 'Only say it\'s ready when there is a `proposalId`.',
  parameters: oppParams,
  mutates: true,
  handler: (a, c) => proposeOpportunity(a, c),
}

// ---------- log_crm_activity ----------
const actParams = z.object({
  clientName: z.string(),
  targetType: z.enum(['person', 'company', 'opportunity']),
  targetName: z.string(),
  type: z.enum(['note', 'call', 'email', 'meeting']).default('note'),
  title: z.string(),
  body: z.string().optional(),
})
type ActArgs = z.infer<typeof actParams>

export async function logCrmActivity(args: ActArgs, ctx: ToolContext, deps: CrmDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx); if (pre) return pre
  if (!args.title?.trim()) return fail('The activity needs a title.')
  const client = one(await deps.resolveClient(args.clientName), args.clientName, 'clientName', `No client matching "${args.clientName}".`)
  if ('result' in client) return client.result
  const resolver = args.targetType === 'person' ? deps.resolvePerson : args.targetType === 'company' ? deps.resolveCompany : deps.resolveOpportunity
  const target = one(await resolver(client.one.id, args.targetName), args.targetName, 'targetName', `No ${args.targetType} matching "${args.targetName}" for ${client.one.name}.`)
  if ('result' in target) return target.result
  const resolved = {
    client_id: client.one.id, clientName: client.one.name,
    target_type: args.targetType, target_id: target.one.id, targetName: target.one.name,
    type: args.type, title: args.title.trim(), body: args.body?.trim() || null,
  }
  return ok({ proposalId: await deps.propose(ctx, 'log_crm_activity', resolved), resolved })
}

export const logActivityTool: AiTool<ActArgs> = {
  name: 'log_crm_activity',
  description: 'PROPOSE logging a CRM activity (note / call / email / meeting) against a contact, company, or opportunity. '
    + 'Does NOT log anything — prepares a proposal the user confirms. Give the client, the target type + name, an '
    + 'activity type and a title (optionally a body). If the result has a `disambiguation`, ask the user to pick.',
  parameters: actParams,
  mutates: true,
  handler: (a, c) => logCrmActivity(a, c),
}

// ---------- propose_quote ----------
const quoteParams = z.object({ clientName: z.string(), opportunityName: z.string() })
type QuoteArgs = z.infer<typeof quoteParams>

// The create-quote endpoint uses requirePricingAccess = requireRole(['owner','admin','project_manager']).
// Gate the tool on the SAME exact roles (MANAGEMENT would include 'lead', causing a propose-then-403).
const PRICING_ROLES = new Set(['owner', 'admin', 'project_manager'])

export async function proposeQuote(args: QuoteArgs, ctx: ToolContext, deps: CrmDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx); if (pre) return pre
  if (!PRICING_ROLES.has(ctx.userRole)) return fail('You do not have permission to generate quotes (billing access required).')
  const client = one(await deps.resolveClient(args.clientName), args.clientName, 'clientName', `No client matching "${args.clientName}".`)
  if ('result' in client) return client.result
  const opp = one(await deps.resolveOpportunity(client.one.id, args.opportunityName), args.opportunityName, 'opportunityName', `No opportunity matching "${args.opportunityName}" for ${client.one.name}.`)
  if ('result' in opp) return opp.result
  const resolved = { client_id: client.one.id, clientName: client.one.name, opportunity_id: opp.one.id, opportunityName: opp.one.name }
  return ok({ proposalId: await deps.propose(ctx, 'propose_quote', resolved), resolved })
}

export const quoteTool: AiTool<QuoteArgs> = {
  name: 'propose_quote',
  description: 'PROPOSE generating a quote from a CRM opportunity (uses the opportunity\'s line items). Does NOT create '
    + 'anything — prepares a proposal the user confirms. Give the client and opportunity name. The opportunity must '
    + 'already have line items. If the result has a `disambiguation`, ask the user to pick. Requires billing access.',
  parameters: quoteParams,
  mutates: true,
  requiredPermission: 'MANAGEMENT',
  handler: (a, c) => proposeQuote(a, c),
}

// ---------- draft_followup (read) ----------
const draftParams = z.object({ clientName: z.string(), opportunityName: z.string() })
type DraftArgs = z.infer<typeof draftParams>

export async function draftFollowup(args: DraftArgs, ctx: ToolContext, deps: CrmDeps = defaultDeps): Promise<ToolResult> {
  try {
    const client = one(await deps.resolveClient(args.clientName), args.clientName, 'clientName', `No client matching "${args.clientName}".`)
    if ('result' in client) return client.result
    const opp = one(await deps.resolveOpportunity(client.one.id, args.opportunityName), args.opportunityName, 'opportunityName', `No opportunity matching "${args.opportunityName}".`)
    if ('result' in opp) return opp.result
    const draft = await deps.draftFollowup(client.one.id, opp.one.id, ctx)
    if (!draft) return fail('Could not draft a follow-up right now (CRM AI may be disabled).')
    return ok({ draft, opportunity: opp.one.name })
  } catch {
    return fail('Could not draft a follow-up right now.')
  }
}

export const draftFollowupTool: AiTool<DraftArgs> = {
  name: 'draft_followup',
  description: 'Draft a follow-up message for a CRM opportunity (suggested text only — nothing is sent or saved). '
    + 'Give the client and opportunity name. Returns a `draft` the user can edit and send themselves. Read-only.',
  parameters: draftParams,
  returnsUntrusted: true,
  handler: (a, c) => draftFollowup(a, c),
}
