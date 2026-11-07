import { z } from 'zod'
import { queryRowsFresh } from '~~/server/utils/db'
import type { AiTool } from './toolRegistry'
import { fail, ok, escapeLike, type ToolContext } from './toolContext'
import { aiInternalFetch } from './internalFetch'
import { resolveFreshStaffRoleAuthority as resolveRoleSkillActor, type FreshStaffRoleAuthority as RoleSkillActor } from './freshStaffRoleAuthority'
import { canAccessAllActiveClients } from './clientAccess'
import { platformAgentEnabled, type NativeAgentFlag } from './platformAgentFlags'
import type { PermissionGroup } from '~~/server/utils/permissions'

interface Client { id: string, name: string }
interface AgentSpec { name: string, label: string, path: string, flag: NativeAgentFlag, groups: PermissionGroup[], company?: boolean }
const SPECS: AgentSpec[] = [
  { name: 'ask_spend_controller', label: 'Spend Controller', path: '/api/agency/agents/spend-controller/ask', flag: 'SPEND_CONTROLLER_AGENT_ENABLED', groups: ['MEDIA_BUYING'] },
  { name: 'ask_publishing_planner', label: 'Publishing Planner', path: '/api/agency/agents/publishing-planner/ask', flag: 'PUBLISHING_PLANNER_AGENT_ENABLED', groups: ['CLIENTS', 'MEDIA_BUYING', 'CREATIVE'] },
  { name: 'ask_financial_watch', label: 'Financial Watch', path: '/api/agency/agents/financial-watch/ask', flag: 'FINANCIAL_WATCH_AGENT_ENABLED', groups: ['FINANCE'], company: true },
  { name: 'ask_traffic_controller', label: 'Traffic Controller', path: '/api/agency/agents/traffic-controller/ask', flag: 'TRAFFIC_CONTROLLER_AGENT_ENABLED', groups: ['ADMIN'] }
]
export interface NativeSpecialistDependencies {
  actor: typeof resolveRoleSkillActor
  clients: (actor: RoleSkillActor, ctx: ToolContext, input: { id?: string, name?: string, company?: boolean }) => Promise<Client[]>
  enabled: (event: ToolContext['event'], flag: NativeAgentFlag) => boolean
  request: typeof aiInternalFetch
}
const defaults: NativeSpecialistDependencies = {
  actor: resolveRoleSkillActor, enabled: platformAgentEnabled, request: aiInternalFetch,
  async clients(actor, ctx, input) {
    const allClients = (input.company === true && actor.permissionGroups.includes('FINANCE')) || canAccessAllActiveClients(actor.permissionGroups)
    const rows = await queryRowsFresh<Client>(`SELECT ac.id::text,ac.name FROM agency_clients ac
      WHERE ac.is_active=TRUE AND ($2::boolean OR EXISTS (SELECT 1 FROM client_team_assignments assignment WHERE assignment.client_id=ac.id AND assignment.team_member_id=$1))
      AND ($3::uuid IS NULL OR ac.id=$3::uuid) AND ($4::text IS NULL OR ac.name ILIKE $4)
      AND ($5::uuid IS NULL OR ac.id=$5::uuid) ORDER BY ac.name,ac.id LIMIT 20`,
    [actor.userId, allClients, input.id ?? null, input.name ? `%${escapeLike(input.name)}%` : null, ctx.clientScope ?? null])
    const scope = ctx.assistantScope
    return scope?.clientAccessMode === 'assigned' && !(input.company === true && actor.permissionGroups.includes('FINANCE'))
      ? rows.filter(row => scope.assignedClientIds.includes(row.id))
      : rows
  }
}
const clientParams = z.strictObject({ name: z.string().trim().min(1).max(100).optional() })
const agentParams = z.strictObject({ prompt: z.string().trim().min(1).max(2000), clientId: z.string().uuid() })
const financeParams = agentParams.extend({ clientId: z.string().uuid().optional() })
function admitted(spec: AgentSpec, actor: RoleSkillActor, ctx: ToolContext, deps: NativeSpecialistDependencies) {
  return actor.userId === ctx.userId && deps.enabled(ctx.event, spec.flag) && spec.groups.some(group => actor.permissionGroups.includes(group))
}
/** Native only: no new MCP tools, invented OAuth scopes, proposal mode or provider writes. */
export async function buildNativeSpecialistTools(ctx: ToolContext, overrides: Partial<NativeSpecialistDependencies> = {}): Promise<AiTool<unknown>[]> {
  if (ctx.source !== 'chat' || !ctx.event) return []
  const deps = { ...defaults, ...overrides }
  try {
    const actor = await deps.actor(ctx.event, ctx.userId)
    const permitted = SPECS.filter(spec => admitted(spec, actor, ctx, deps))
    const tools: AiTool<unknown>[] = []
    if (permitted.some(spec => !spec.company)) tools.push({
      name: 'get_agent_clients', description: 'Find up to 20 active client names and identifiers authorized for this caller before a client-specific specialist review. Narrow by client name. If several match, ask the user to choose; never guess a client.',
      parameters: clientParams, returnsUntrusted: true,
      async handler(raw) {
        try {
          const args = clientParams.parse(raw)
          const current = await deps.actor(ctx.event, ctx.userId)
          if (!SPECS.some(spec => !spec.company && admitted(spec, current, ctx, deps))) return fail('Specialist client lookup is no longer available.', 'forbidden')
          return ok({ clients: await deps.clients(current, ctx, args), limit: 20, coverage: 'Only currently authorized active clients; refine the name if the result is full.' })
        } catch { return fail('Authorized client lookup unavailable.', 'unavailable') }
      }
    })
    for (const spec of permitted) tools.push({
      name: spec.name, description: `Ask the existing ${spec.label} specialist for a bounded read-only review. ${spec.company ? 'Uses the caller\'s selected accounting organization; Finance requires an explicit current grant.' : 'Requires an exact authorized clientId from get_agent_clients; ask the user if the client is missing or ambiguous.'} Never changes a campaign, budget, post or accounting record. Returns the specialist report or an explicit unavailable result.`,
      parameters: spec.company ? financeParams : agentParams,
      requiredPermission: spec.groups.length === 1 ? spec.groups[0] : undefined, returnsUntrusted: true,
      async handler(raw) {
        try {
          const args = (spec.company ? financeParams : agentParams).parse(raw)
          const current = await deps.actor(ctx.event, ctx.userId)
          if (!admitted(spec, current, ctx, deps)) return fail('Specialist is disabled or no longer permitted.', 'forbidden')
          const clientId = args.clientId ?? ctx.clientScope
          if (ctx.clientScope && clientId !== ctx.clientScope) return fail('Client is outside this conversation scope.', 'forbidden')
          if (clientId && !(await deps.clients(current, ctx, { id: clientId, company: spec.company === true })).some(client => client.id === clientId)) return fail('Client is outside your current access.', 'forbidden')
          const body = { prompt: args.prompt, context: clientId ? { clientId } : {}, ...(spec.name === 'ask_spend_controller' ? { draftActions: false } : {}) }
          const report = await deps.request(spec.path, { method: 'POST', body, timeout: 15_000 }, ctx)
          return ok({ agent: spec.label, mode: 'read_only', report })
        } catch { return fail('Specialist review unavailable; no provider action was requested.', 'unavailable') }
      }
    })
    return tools
  } catch { return [] }
}
