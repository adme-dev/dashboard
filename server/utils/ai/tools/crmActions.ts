import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult, isConversationlessProposeContext } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { proposeAction } from '../pendingActions'
import { pickByExactName, type NamedRef } from './createTask'
import {
  resolveAgencyAiCrmContext,
  type AgencyAiContextResolution,
  type CrmSearchContext
} from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess, type CrmRecordType } from '~~/server/utils/crm/recordAccess'

/**
 * CRM proposal and draft tools. Client selection is always resolved through the
 * fresh CRM AI context; model-provided names never become authority.
 */

const ilike = (name: string) => `%${escapeLike(name)}%`

export type CrmDeps = {
  resolveContext: (ctx: ToolContext, clientName: string) => Promise<AgencyAiContextResolution>
  resolveStage: (context: CrmSearchContext, name: string) => Promise<NamedRef[]>
  resolvePerson: (context: CrmSearchContext, name: string) => Promise<NamedRef[]>
  resolveCompany: (context: CrmSearchContext, name: string) => Promise<NamedRef[]>
  resolveOpportunity: (context: CrmSearchContext, name: string) => Promise<NamedRef[]>
  authorizeMatches: (context: CrmSearchContext, type: CrmRecordType, matches: NamedRef[]) => Promise<NamedRef[]>
  propose: (ctx: ToolContext, toolName: string, payload: unknown) => Promise<string>
  draftFollowup: (clientId: string, opportunityId: string, ctx: ToolContext) => Promise<string>
}

function ownerPredicate(context: CrmSearchContext, alias: string, params: unknown[]) {
  if (context.actorType !== 'staff' || !context.visibility.ownerScoped) return ''
  params.push(context.actorId, context.actorId)
  return ` AND (${alias}.owner_id = $${params.length - 1} OR ${alias}.assigned_to = $${params.length})`
}

async function authorizeNamedMatches(
  context: CrmSearchContext,
  type: CrmRecordType,
  matches: NamedRef[]
) {
  const authorized: NamedRef[] = []
  for (const match of matches) {
    try {
      await requireCrmRecordAccess(context, { type, id: match.id })
      authorized.push(match)
    } catch (error) {
      if ((error as { statusCode?: unknown } | null)?.statusCode !== 404) throw error
    }
  }
  return authorized
}

const defaultDeps: CrmDeps = {
  resolveContext: (ctx, clientName) => resolveAgencyAiCrmContext(ctx, { clientName }),
  resolveStage: (context, name) =>
    queryRows<NamedRef>(
      `SELECT id, name FROM crm_stages
        WHERE name ILIKE $1 AND (client_id IS NULL OR client_id = $2)
        ORDER BY (lower(name)=lower($3)) DESC LIMIT 6`,
      [ilike(name), context.clientId, name]
    ),
  resolvePerson: (context, name) => {
    const params: unknown[] = [context.clientId, ilike(name)]
    const visibility = ownerPredicate(context, 'person', params)
    return queryRows<NamedRef>(
      `SELECT person.id, trim(person.first_name || ' ' || COALESCE(person.last_name,'')) AS name
         FROM crm_people person
        WHERE person.client_id = $1 AND person.deleted_at IS NULL
          AND trim(person.first_name || ' ' || COALESCE(person.last_name,'')) ILIKE $2${visibility}
        ORDER BY name LIMIT 6`,
      params
    )
  },
  resolveCompany: (context, name) => {
    const params: unknown[] = [context.clientId, ilike(name), name]
    const visibility = ownerPredicate(context, 'company', params)
    return queryRows<NamedRef>(
      `SELECT company.id, company.name FROM crm_companies company
        WHERE company.client_id = $1 AND company.deleted_at IS NULL
          AND company.name ILIKE $2${visibility}
        ORDER BY (lower(company.name)=lower($3)) DESC, company.name LIMIT 6`,
      params
    )
  },
  resolveOpportunity: (context, name) => {
    const params: unknown[] = [context.clientId, ilike(name), name]
    const visibility = ownerPredicate(context, 'opportunity', params)
    return queryRows<NamedRef>(
      `SELECT opportunity.id, opportunity.name FROM crm_opportunities opportunity
        WHERE opportunity.client_id = $1 AND opportunity.deleted_at IS NULL
          AND opportunity.name ILIKE $2${visibility}
        ORDER BY (lower(opportunity.name)=lower($3)) DESC, opportunity.created_at DESC LIMIT 6`,
      params
    )
  },
  authorizeMatches: authorizeNamedMatches,
  propose: (ctx, toolName, payload) => proposeAction(ctx, ctx.conversationId ?? null, toolName, payload),
  draftFollowup: async (clientId, opportunityId, ctx) => {
    const response: any = await aiInternalFetch(
      '/api/crm/ai/draft-followup',
      { method: 'POST', body: { client_id: clientId, opportunity_id: opportunityId } },
      ctx
    )
    return typeof response?.draft === 'string' ? response.draft : ''
  }
}

function preflight(ctx: ToolContext): ToolResult | null {
  if (isReadOnlyRole(ctx.userRole)) return fail('You do not have permission to make this change.')
  if (!isConversationlessProposeContext(ctx)) return fail('Cannot prepare this action outside a conversation.')
  return null
}

function one<T extends NamedRef>(
  matches: T[],
  name: string,
  field: string,
  none: string
): { one: T } | { result: ToolResult } {
  const picked = pickByExactName(matches, name)
  if (picked.length === 0) return { result: fail(none) }
  if (picked.length > 1) return { result: ok({ disambiguation: { field, options: picked } }) }
  return { one: picked[0]! }
}

async function resolveClientContext(
  ctx: ToolContext,
  name: string,
  deps: CrmDeps
): Promise<
  | { result: ToolResult }
  | { context: CrmSearchContext; client: NamedRef }
> {
  const resolution = await deps.resolveContext(ctx, name)
  if (resolution.status !== 'resolved') return { result: fail('No matching client.') }
  return {
    context: resolution.context,
    client: { id: resolution.context.clientId, name: resolution.clientName }
  }
}

async function visibleMatches(
  deps: CrmDeps,
  context: CrmSearchContext,
  type: CrmRecordType,
  matches: NamedRef[]
) {
  return await deps.authorizeMatches(context, type, matches)
}

const oppParams = z.object({
  clientName: z.string(),
  name: z.string(),
  stageName: z.string().default('new'),
  amount: z.number().optional(),
  personName: z.string().optional()
})
type OppArgs = z.infer<typeof oppParams>

export async function proposeOpportunity(args: OppArgs, ctx: ToolContext, deps: CrmDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx)
  if (pre) return pre
  if (!args.name?.trim()) return fail('An opportunity needs a name.')
  const selected = await resolveClientContext(ctx, args.clientName, deps)
  if ('result' in selected) return selected.result
  const { client, context } = selected
  const stage = one(
    await deps.resolveStage(context, args.stageName),
    args.stageName,
    'stageName',
    `No pipeline stage matching "${args.stageName}".`
  )
  if ('result' in stage) return stage.result
  let person: NamedRef | null = null
  if (args.personName) {
    const match = one(
      await visibleMatches(deps, context, 'person', await deps.resolvePerson(context, args.personName)),
      args.personName,
      'personName',
      `No contact matching "${args.personName}".`
    )
    if ('result' in match) return match.result
    person = match.one
  }
  const resolved = {
    client_id: client.id,
    clientName: client.name,
    name: args.name.trim(),
    stage_id: stage.one.id,
    stageName: stage.one.name,
    amount: typeof args.amount === 'number' ? args.amount : 0,
    person_id: person?.id ?? null,
    personName: person?.name ?? null
  }
  return ok({ proposalId: await deps.propose(ctx, 'propose_opportunity', resolved), resolved })
}

export const opportunityTool: AiTool<OppArgs> = {
  name: 'propose_opportunity',
  description: 'PROPOSE creating a CRM opportunity for a client. This prepares a proposal for confirmation and does not create the record. Give a client and opportunity name, with an optional stage, amount, and contact. Ask the user to choose when an authorized disambiguation is returned.',
  parameters: oppParams,
  mutates: true,
  requiredPermission: 'CLIENTS',
  handler: (args, ctx) => proposeOpportunity(args, ctx)
}

const actParams = z.object({
  clientName: z.string(),
  targetType: z.enum(['person', 'company', 'opportunity']),
  targetName: z.string(),
  type: z.enum(['note', 'call', 'email', 'meeting']).default('note'),
  title: z.string(),
  body: z.string().optional()
})
type ActArgs = z.infer<typeof actParams>

export async function logCrmActivity(args: ActArgs, ctx: ToolContext, deps: CrmDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx)
  if (pre) return pre
  if (!args.title?.trim()) return fail('The activity needs a title.')
  const selected = await resolveClientContext(ctx, args.clientName, deps)
  if ('result' in selected) return selected.result
  const { client, context } = selected
  const resolver = args.targetType === 'person'
    ? deps.resolvePerson
    : args.targetType === 'company'
      ? deps.resolveCompany
      : deps.resolveOpportunity
  const target = one(
    await visibleMatches(deps, context, args.targetType, await resolver(context, args.targetName)),
    args.targetName,
    'targetName',
    `No ${args.targetType} matching "${args.targetName}" for ${client.name}.`
  )
  if ('result' in target) return target.result
  const resolved = {
    client_id: client.id,
    clientName: client.name,
    target_type: args.targetType,
    target_id: target.one.id,
    targetName: target.one.name,
    type: args.type,
    title: args.title.trim(),
    body: args.body?.trim() || null
  }
  return ok({ proposalId: await deps.propose(ctx, 'log_crm_activity', resolved), resolved })
}

export const logActivityTool: AiTool<ActArgs> = {
  name: 'log_crm_activity',
  description: 'PROPOSE logging a CRM activity against a contact, company, or opportunity. This prepares a proposal for confirmation and does not write immediately. Give the client, target type and name, activity type, and title. Ask the user to choose only from returned authorized disambiguation options.',
  parameters: actParams,
  mutates: true,
  requiredPermission: 'CLIENTS',
  handler: (args, ctx) => logCrmActivity(args, ctx)
}

const quoteParams = z.object({ clientName: z.string(), opportunityName: z.string() })
type QuoteArgs = z.infer<typeof quoteParams>
const PRICING_ROLES = new Set(['owner', 'admin', 'project_manager'])

export async function proposeQuote(args: QuoteArgs, ctx: ToolContext, deps: CrmDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx)
  if (pre) return pre
  if (!PRICING_ROLES.has(ctx.userRole)) return fail('You do not have permission to generate quotes (billing access required).')
  const selected = await resolveClientContext(ctx, args.clientName, deps)
  if ('result' in selected) return selected.result
  const { client, context } = selected
  const opp = one(
    await visibleMatches(deps, context, 'opportunity', await deps.resolveOpportunity(context, args.opportunityName)),
    args.opportunityName,
    'opportunityName',
    `No opportunity matching "${args.opportunityName}" for ${client.name}.`
  )
  if ('result' in opp) return opp.result
  const resolved = {
    client_id: client.id,
    clientName: client.name,
    opportunity_id: opp.one.id,
    opportunityName: opp.one.name
  }
  return ok({ proposalId: await deps.propose(ctx, 'propose_quote', resolved), resolved })
}

export const quoteTool: AiTool<QuoteArgs> = {
  name: 'propose_quote',
  description: 'PROPOSE generating a quote from an existing CRM opportunity. This prepares a proposal for confirmation and does not create a quote immediately. The opportunity must already have line items and the caller must have pricing access. Ask the user to choose only from returned authorized disambiguation options.',
  parameters: quoteParams,
  mutates: true,
  requiredPermission: 'CLIENTS',
  handler: (args, ctx) => proposeQuote(args, ctx)
}

const draftParams = z.object({ clientName: z.string(), opportunityName: z.string() })
type DraftArgs = z.infer<typeof draftParams>

export async function draftFollowup(args: DraftArgs, ctx: ToolContext, deps: CrmDeps = defaultDeps): Promise<ToolResult> {
  try {
    const selected = await resolveClientContext(ctx, args.clientName, deps)
    if ('result' in selected) return selected.result
    const { client, context } = selected
    const opp = one(
      await visibleMatches(deps, context, 'opportunity', await deps.resolveOpportunity(context, args.opportunityName)),
      args.opportunityName,
      'opportunityName',
      `No opportunity matching "${args.opportunityName}" for ${client.name}.`
    )
    if ('result' in opp) return opp.result
    const draft = await deps.draftFollowup(client.id, opp.one.id, ctx)
    if (!draft) return fail('Could not draft a follow-up right now (CRM AI may be disabled).')
    return ok({ draft, opportunity: opp.one.name })
  } catch {
    return fail('Could not draft a follow-up right now.')
  }
}

export const draftFollowupTool: AiTool<DraftArgs> = {
  name: 'draft_followup',
  description: 'Draft suggested follow-up text for an existing CRM opportunity. Nothing is sent or saved. Give the client and opportunity name. Only authorized opportunity matches can be used or returned for disambiguation.',
  parameters: draftParams,
  returnsUntrusted: true,
  requiredPermission: 'CLIENTS',
  handler: (args, ctx) => draftFollowup(args, ctx)
}
