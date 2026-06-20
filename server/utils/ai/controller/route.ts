import type { AiIntent } from '~/types'
import { roleHasPermission, type PermissionGroup } from '~~/server/utils/permissions'
import { roleDefaultPersona } from '../rolePersona'
import { packForIntent } from './registry'

/**
 * L1 traffic-controller routing (Phase 3, spec §3/§7-step-2). PURE: given the turn's intent + the
 * user's role (and whether they pinned a persona), pick ONE skill-pack for this turn. Precedence:
 *
 *   explicit/persisted pick  →  intent-matched pack (RBAC-entitled)  →  role-default  →  generalist
 *
 * The auto-select only kicks in when the user hasn't pinned a persona, and it never persists — it's
 * per-turn routing (a finance question routes an owner to the Finance pack for that turn; a follow-up
 * about tasks routes to Account next turn). Narrows focus only; RBAC still governs the actual tools.
 * Deps are injected so the decision is unit-tested without the real permission tables.
 */
export interface RouteArgs {
  intent?: AiIntent | null
  userRole: string
}
export interface RouteResult {
  persona: string
  /** Why this pack was chosen — for logging/observability (and L2 later). */
  reason: 'explicit' | 'intent' | 'role-default' | 'generalist'
}
export interface RouteDeps {
  hasPermission: (role: string, group: PermissionGroup) => boolean
  roleDefault: (role: string) => string | undefined
}

const defaultDeps: RouteDeps = {
  hasPermission: roleHasPermission,
  roleDefault: roleDefaultPersona,
}

export function selectSkillPack(
  args: RouteArgs,
  explicitOrPersisted: string | null | undefined,
  deps: RouteDeps = defaultDeps,
): RouteResult {
  if (explicitOrPersisted) return { persona: explicitOrPersisted, reason: 'explicit' }

  const byIntent = packForIntent(args.intent, group => deps.hasPermission(args.userRole, group))
  if (byIntent) return { persona: byIntent.persona, reason: 'intent' }

  const roleDefault = deps.roleDefault(args.userRole)
  if (roleDefault) return { persona: roleDefault, reason: 'role-default' }

  return { persona: 'general', reason: 'generalist' }
}
