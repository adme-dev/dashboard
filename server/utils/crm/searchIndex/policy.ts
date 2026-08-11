import {
  CRM_SEARCH_GLOBAL_STATES,
  CRM_SEARCH_MODES,
  CRM_SEARCH_POLICY_STATES,
  CRM_SEARCH_PROVIDER_ACTIONS,
  CRM_SEARCH_SCHEMA_ROLES,
  CRM_SEARCH_SURFACES,
  type CrmSearchGlobalState,
  type CrmSearchMode,
  type CrmSearchPolicyState,
  type CrmSearchProviderAction,
  type CrmSearchSchemaRole,
  type CrmSearchSurface
} from './contracts'

export const CRM_SEARCH_MODE_ORDER = Object.freeze({
  off: 0,
  shadow: 1,
  assist: 2
} as const satisfies Record<CrmSearchMode, number>)

export const CRM_SEARCH_SURFACE_CEILINGS = Object.freeze({
  portal_global: 'off',
  agency_global: 'shadow',
  agency_ai: 'assist'
} as const satisfies Record<CrmSearchSurface, CrmSearchMode>)

export interface ResolveEffectiveCrmSearchModeInput {
  globalState: unknown
  globalMaximum: unknown
  policyMode: unknown
  surface: unknown
  infrastructureReady: unknown
}

export interface CrmSearchProviderActionPolicyInput {
  globalState: unknown
  policyState: unknown
  action: unknown
  schemaRole: unknown
  /** Provider binding/action readiness; teardown must not depend on query/sentinel readiness. */
  infrastructureReady: unknown
  /** Proven only from the durable teardown snapshot, never caller input. */
  teardownAuthorized: unknown
}

function isMode(value: unknown): value is CrmSearchMode {
  return typeof value === 'string' && CRM_SEARCH_MODES.includes(value as CrmSearchMode)
}

function isGlobalState(value: unknown): value is CrmSearchGlobalState {
  return typeof value === 'string'
    && CRM_SEARCH_GLOBAL_STATES.includes(value as CrmSearchGlobalState)
}

function isSurface(value: unknown): value is CrmSearchSurface {
  return typeof value === 'string' && CRM_SEARCH_SURFACES.includes(value as CrmSearchSurface)
}

function isPolicyState(value: unknown): value is CrmSearchPolicyState {
  return typeof value === 'string'
    && CRM_SEARCH_POLICY_STATES.includes(value as CrmSearchPolicyState)
}

function isProviderAction(value: unknown): value is CrmSearchProviderAction {
  return typeof value === 'string'
    && CRM_SEARCH_PROVIDER_ACTIONS.includes(value as CrmSearchProviderAction)
}

function isSchemaRole(value: unknown): value is CrmSearchSchemaRole {
  return typeof value === 'string'
    && CRM_SEARCH_SCHEMA_ROLES.includes(value as CrmSearchSchemaRole)
}

export function resolvePolicyStateMode(state: unknown): CrmSearchMode {
  if (!isPolicyState(state)) return 'off'
  if (state === 'shadow') return 'shadow'
  if (state === 'assist') return 'assist'
  return 'off'
}

/** Missing, malformed, non-enabled, or unready state always resolves to off. */
export function resolveEffectiveCrmSearchMode(
  input: ResolveEffectiveCrmSearchModeInput
): CrmSearchMode {
  if (!input || input.infrastructureReady !== true) return 'off'
  if (!isGlobalState(input.globalState) || input.globalState !== 'enabled') return 'off'
  if (!isMode(input.globalMaximum)
    || !isMode(input.policyMode)
    || !isSurface(input.surface)) return 'off'

  const ceiling = CRM_SEARCH_SURFACE_CEILINGS[input.surface]
  const mostRestrictive = Math.min(
    CRM_SEARCH_MODE_ORDER[input.globalMaximum],
    CRM_SEARCH_MODE_ORDER[input.policyMode],
    CRM_SEARCH_MODE_ORDER[ceiling]
  )
  return CRM_SEARCH_MODES.find(mode => CRM_SEARCH_MODE_ORDER[mode] === mostRestrictive) ?? 'off'
}

/**
 * Pure provider guard. Repositories must still fresh-read and lock the
 * authoritative control/policy row immediately before an external call.
 */
export function isCrmSearchProviderActionAllowed(
  input: CrmSearchProviderActionPolicyInput
): boolean {
  if (!input || input.infrastructureReady !== true) return false
  if (!isGlobalState(input.globalState)
    || !isProviderAction(input.action)
    || !isSchemaRole(input.schemaRole)
    || typeof input.teardownAuthorized !== 'boolean') return false
  if (input.globalState === 'halted') return false

  if (input.teardownAuthorized) {
    return input.action === 'delete'
  }
  if (input.globalState === 'delete_only') return false
  if (!isPolicyState(input.policyState) || input.policyState === 'off') return false
  if (input.policyState === 'teardown_pending') return false

  if (input.action === 'upsert') {
    return input.schemaRole === 'active' || input.schemaRole === 'candidate'
  }

  return input.schemaRole === 'active'
    || input.schemaRole === 'candidate'
    || input.schemaRole === 'retiring'
}
