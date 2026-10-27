// server/utils/ai/mcp/marketingPolicy.ts
// The single policy interpretation for ordinary (non-owner) MCP staff, shared by tools/list,
// tools/call and the connector preview (my-tools).
//
//  - Management staff (fresh MANAGEMENT or ADMIN group) keep the existing registered projection, now
//    narrowed by their fresh groups, read-only policy and — always — the signed mcp:write scope.
//  - Every other staff member sees and calls ONLY tools in MCP_STAFF_TOOL_POLICY that are `reviewed`.
//    Unlisted tools (lead summaries, client overview/profitability, propose/confirm suites, GTM,
//    finance…) are denied at discovery AND invocation until their handlers satisfy the scope contract.
//  - Marketing capabilities come from the operator-owned MCP_MARKETING_STAFF_GRANTS binding. A grant
//    unlocks only its listed reviewed tools; it never creates a permission group or all-client scope.
import { PERMISSIONS, type PermissionGroup } from '~~/server/utils/permissions'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { MarketingCapability, ToolContext } from '~~/server/utils/ai/toolContext'
import { hasWriteScope, isWriteScopeToolName } from './scope'
import { resolveProposeAction } from './writeTools'
import {
  runReadToolHandler,
  toMcpToolManifest,
  type ExecuteOutcome,
  type McpProjectionContext,
  type McpToolManifest
} from './project'
import { projectRegisteredMcpTools, projectStaffOnlyMcpTools, type RegisteredMcpSuite } from './registry'
import { ADS_STAFF_READ_NAMES,ADS_STAFF_PLAN_NAMES,GTM_STAFF_NAMES,TASK4_STAFF_NAMES,isLegacyAdsMutation } from './marketingTask4Names'
import { LEGACY_MCP_SOCIAL_PROPOSAL_TOOL, SOCIAL_MCP_TOOL_NAMES } from './socialToolNames'

export type { MarketingCapability } from '~~/server/utils/ai/toolContext'

export const MARKETING_CAPABILITIES = Object.freeze([
  'reporting',
  'social_draft',
  'ads_plan',
  'tracking_plan'
] as const satisfies readonly MarketingCapability[])

const CAPABILITY_SET = new Set<string>(MARKETING_CAPABILITIES)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_GRANT_ENTRIES = 500

/** The six marketing reads of the staff pilot (spec slice 1). */
export const MARKETING_PILOT_READ_TOOLS = Object.freeze([
  'get_campaign_breakdown',
  'get_ad_breakdown',
  'get_ad_creative_text',
  'get_search_terms',
  'get_adspend_pacing',
  'get_social_performance'
] as const)

export type StaffToolReviewStatus = 'reviewed' | 'pending_scope_review'

export interface StaffToolPolicyEntry {
  /** Capability grant required; null = every non-management staff member (actor-private/self-scoped). */
  capability: MarketingCapability | null
  /** Only `reviewed` tools are listed or callable. Flip per tool once its full data path is scoped. */
  status: StaffToolReviewStatus
  /** Returns client data: requires a resolved `assigned` scope with at least one current client. */
  clientScoped: boolean
  /** Handler widens on legacy `ctx.userRole`; denied when a custom role narrows a broad legacy role. */
  legacyRoleSensitive: boolean
}

/** Delegated social drafting (Task 3): local drafts/revisions only; review happens in XeroFlow. */
const socialDraft: StaffToolPolicyEntry = Object.freeze({
  capability: 'social_draft',
  status: 'reviewed',
  clientScoped: true,
  legacyRoleSensitive: false
})

const pilotRead: StaffToolPolicyEntry = Object.freeze({
  capability: 'reporting',
  // Task 2: real scoped services, stored-only staff reads, adapter/SQL-contract tests.
  status: 'reviewed',
  clientScoped: true,
  legacyRoleSensitive: false
})

/** Registered, reviewed staff tools. Anything absent is denied for non-management staff. */
export const MCP_STAFF_TOOL_POLICY: Readonly<Record<string, StaffToolPolicyEntry>> = Object.freeze({
  ...Object.fromEntries(ADS_STAFF_READ_NAMES.map(name=>[name,{...pilotRead,capability:'ads_plan'}])),
  ...Object.fromEntries(ADS_STAFF_PLAN_NAMES.map(name=>[name,{...pilotRead,capability:'ads_plan'}])),
  ...Object.fromEntries(GTM_STAFF_NAMES.map(name=>[name,{...pilotRead,capability:'tracking_plan'}])),
  // Private per-user memory: actor-bound write through its own durable coordinator; needs mcp:write.
  remember: Object.freeze({ capability: null, status: 'reviewed', clientScoped: false, legacyRoleSensitive: false }),
  // Pinned to the caller's own assigned tasks for non-manager legacy roles (tasks.ts).
  get_tasks: Object.freeze({ capability: null, status: 'reviewed', clientScoped: false, legacyRoleSensitive: true }),
  get_client_overview: pilotRead,
  ...Object.fromEntries(MARKETING_PILOT_READ_TOOLS.map(name => [name, pilotRead])),
  ...Object.fromEntries(SOCIAL_MCP_TOOL_NAMES.map(name => [name, socialDraft]))
})

/** Staff-only suite tools management staff may also reach (still grant/scope/client admitted). */
const MANAGEMENT_ADMITTED_STAFF_SUITE_TOOLS = new Set<string>([...SOCIAL_MCP_TOOL_NAMES,...TASK4_STAFF_NAMES])

// ---------------------------------------------------------------------------------------------------
// Grant configuration

export interface MarketingStaffGrantConfig {
  status: 'unset' | 'valid' | 'invalid'
  /** Lower-cased user UUID → deduplicated capabilities. Always empty unless status is 'valid'. */
  grants: ReadonlyMap<string, readonly MarketingCapability[]>
  /** Diagnostic code only; never echoes configured values. */
  errorCode?: 'not_a_string' | 'malformed_json' | 'not_an_object' | 'too_many_entries' | 'invalid_user_id' | 'invalid_capability_list'
}

const EMPTY_GRANTS: ReadonlyMap<string, readonly MarketingCapability[]> = new Map()

function invalidGrants(errorCode: NonNullable<MarketingStaffGrantConfig['errorCode']>): MarketingStaffGrantConfig {
  console.warn(`[mcp] MCP_MARKETING_STAFF_GRANTS rejected (${errorCode}); no marketing grants are active`)
  return { status: 'invalid', grants: EMPTY_GRANTS, errorCode }
}

/**
 * Parse `{ "<team member UUID>": ["reporting", ...] }`. Any malformed entry invalidates the WHOLE
 * configuration (fail closed for everyone) so a typo can never silently grant or mis-assign access.
 */
export function parseMarketingStaffGrants(raw: unknown): MarketingStaffGrantConfig {
  if (raw === undefined || raw === null) return { status: 'unset', grants: EMPTY_GRANTS }
  if (typeof raw !== 'string') return invalidGrants('not_a_string')
  if (!raw.trim()) return { status: 'unset', grants: EMPTY_GRANTS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return invalidGrants('malformed_json')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalidGrants('not_an_object')
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length > MAX_GRANT_ENTRIES) return invalidGrants('too_many_entries')
  const grants = new Map<string, readonly MarketingCapability[]>()
  for (const [userId, capabilities] of entries) {
    if (!UUID_PATTERN.test(userId)) return invalidGrants('invalid_user_id')
    if (!Array.isArray(capabilities) || capabilities.some(value => typeof value !== 'string' || !CAPABILITY_SET.has(value))) {
      return invalidGrants('invalid_capability_list')
    }
    const key = userId.toLowerCase()
    const merged = new Set<MarketingCapability>([...(grants.get(key) ?? []), ...capabilities as MarketingCapability[]])
    grants.set(key, Object.freeze([...merged]))
  }
  return { status: 'valid', grants }
}

export function marketingCapabilitiesFor(config: MarketingStaffGrantConfig, userId: string): MarketingCapability[] {
  if (config.status !== 'valid') return []
  return [...(config.grants.get(userId.toLowerCase()) ?? [])]
}

// ---------------------------------------------------------------------------------------------------
// Authority predicates

export const MCP_ALL_CLIENT_GROUPS: readonly PermissionGroup[] = Object.freeze(['ADMIN', 'MANAGEMENT'])

export function hasMcpAllClientAuthority(groups: readonly PermissionGroup[] | undefined): boolean {
  return !!groups && MCP_ALL_CLIENT_GROUPS.some(group => groups.includes(group))
}

/** Management staff = explicit fresh MANAGEMENT/ADMIN group. Legacy role strings and grants never count. */
export function isMcpManagementStaff(ctx: Pick<ToolContext, 'permissionGroups'>): boolean {
  return hasMcpAllClientAuthority(ctx.permissionGroups)
}

const LEGACY_BROAD_ROLES = new Set<string>([...PERMISSIONS.MANAGEMENT, ...PERMISSIONS.ADMIN])

export type StaffToolDenialCode
  = 'not_reviewed'
    | 'capability_required'
    | 'insufficient_scope'
    | 'read_only'
    | 'no_client_assignments'
    | 'role_policy_mismatch'

export type StaffToolAdmission
  = | { allowed: true, entry: StaffToolPolicyEntry }
    | { allowed: false, code: StaffToolDenialCode, error: string }

function deny(code: StaffToolDenialCode, error: string): StaffToolAdmission {
  return { allowed: false, code, error }
}

function scopeSet(scopes: ToolContext['mcpScopes']): Set<string> {
  return scopes instanceof Set ? scopes : new Set(scopes ?? [])
}

/**
 * Admission for a NON-management staff member. Pure over the resolved context, so discovery and
 * invocation evaluate exactly the same rule; a stale host catalog therefore cannot authorize a call.
 */
export function evaluateStaffToolAdmission(
  name: string,
  ctx: ToolContext,
  policy: Readonly<Record<string, StaffToolPolicyEntry>> = MCP_STAFF_TOOL_POLICY
): StaffToolAdmission {
  const entry = Object.prototype.hasOwnProperty.call(policy, name) ? policy[name] : undefined
  if (!entry || entry.status !== 'reviewed') {
    return deny('not_reviewed', 'This tool is not available to your XeroFlow account over MCP.')
  }
  if (entry.capability && !(ctx.marketingCapabilities ?? []).includes(entry.capability)
    && !(ADS_STAFF_READ_NAMES.includes(name as any) && !isWriteScopeToolName(name) && (ctx.marketingCapabilities ?? []).includes('reporting'))) {
    return deny('capability_required', 'Your account has not been granted this marketing capability.')
  }
  if (isWriteScopeToolName(name)) {
    if (ctx.assistantReadOnly === true) return deny('read_only', 'Your role is read-only.')
    if (!hasWriteScope(scopeSet(ctx.mcpScopes))) {
      return deny('insufficient_scope', 'This action requires write access. Reconnect your AI assistant and grant write (mcp:write) to use it.')
    }
  }
  // Fresh MANAGEMENT/ADMIN staff resolve to all ACTIVE clients; everyone else needs ≥1 assignment.
  const allActive = ctx.assistantScope?.clientAccessMode === 'all_active' && isMcpManagementStaff(ctx)
  if (entry.clientScoped && !allActive && (
    ctx.assistantScope?.clientAccessMode !== 'assigned'
    || ctx.assistantScope.assignedClientIds.length === 0
  )) {
    return deny('no_client_assignments', 'You have no current client assignments.')
  }
  if (entry.legacyRoleSensitive && LEGACY_BROAD_ROLES.has(ctx.userRole)) {
    return deny('role_policy_mismatch', 'Your current role policy does not permit this tool.')
  }
  return { allowed: true, entry }
}

// ---------------------------------------------------------------------------------------------------
// Projection (tools/list + my-tools) and staff execution (tools/call)

function isMutatingManifestName(name: string, registryTool: AiTool<unknown> | undefined): boolean {
  return isWriteScopeToolName(name) || name.startsWith('propose_') || registryTool?.mutates === true
}

export interface StaffProjectionInput {
  /** Route-assembled context: registry, suite flags. Role/scope/groups are taken from `staff`. */
  context: McpProjectionContext
  /** Fresh ToolContext from resolveMcpStaffContext. */
  staff: ToolContext
  policy?: Readonly<Record<string, StaffToolPolicyEntry>>
  suites?: readonly RegisteredMcpSuite[]
}

/** The one ordinary-staff projection used by tools/list and the connector preview. */
export function projectMcpToolsForStaff(input: StaffProjectionInput): McpToolManifest[] {
  const { staff } = input
  const scopes = [...scopeSet(staff.mcpScopes)]
  const groups = staff.permissionGroups ?? []
  const registryByName = new Map(input.context.tools.map(tool => [tool.name, tool]))

  const staffSuiteManifests = projectStaffOnlyMcpTools(input.context)
    .filter(manifest => evaluateStaffToolAdmission(manifest.name, staff, input.policy).allowed)

  if (!isMcpManagementStaff(staff)) {
    return [
      ...input.context.tools
        .filter(tool => evaluateStaffToolAdmission(tool.name, staff, input.policy).allowed)
        .map(toMcpToolManifest),
      ...staffSuiteManifests
    ]
  }

  const managementContext: McpProjectionContext = {
    ...input.context,
    role: staff.userRole,
    scopes,
    permissionGroups: groups,
    readOnly: staff.assistantReadOnly === true,
    // Ordinary users always need signed write consent; the legacy opt-out only shapes owner auditing.
    requireWriteScope: true
  }
  const manifests = input.suites
    ? projectRegisteredMcpTools(managementContext, input.suites)
    : projectRegisteredMcpTools(managementContext)

  return [
    ...manifests.filter((manifest) => {
      // Ordinary MCP social preparation goes through the reviewed draft suite, management included:
      // the legacy self-approvable proposal is never offered to ordinary staff.
      if (manifest.name === LEGACY_MCP_SOCIAL_PROPOSAL_TOOL || isLegacyAdsMutation(manifest.name) || manifest.name.startsWith('google_ads_')) return false
      // Suite projectors still filter by legacy role; re-apply the fresh group ceiling for any manifest
      // backed by a registry tool (catalog reads and their propose_* aliases).
      const registryTool = registryByName.get(manifest.name)
        ?? registryByName.get(resolveProposeAction(manifest.name) ?? '')
      if (registryTool?.requiredPermission && !groups.includes(registryTool.requiredPermission)) return false
      if (staff.assistantReadOnly === true && isMutatingManifestName(manifest.name, registryTool)) return false
      return true
    }),
    ...staffSuiteManifests.filter(manifest => MANAGEMENT_ADMITTED_STAFF_SUITE_TOOLS.has(manifest.name))
  ]
}

/** Execute one admitted read for a NON-management staff member (admission is re-evaluated here). */
export async function executeStaffMcpReadTool(
  tools: AiTool<unknown>[],
  name: string,
  args: unknown,
  ctx: ToolContext,
  policy: Readonly<Record<string, StaffToolPolicyEntry>> = MCP_STAFF_TOOL_POLICY
): Promise<ExecuteOutcome | { ok: false, error: string, code: StaffToolDenialCode }> {
  const admission = evaluateStaffToolAdmission(name, ctx, policy)
  if (!admission.allowed) return { ok: false, error: admission.error, code: admission.code }
  const tool = tools.find(candidate => candidate.name === name)
  if (!tool) return { ok: false, error: `Unknown tool: ${name}`, code: 'not_found' }
  return await runReadToolHandler(tool, args, ctx)
}
