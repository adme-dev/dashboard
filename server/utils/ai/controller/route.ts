import type { AiIntent } from '~/types'
import { roleHasPermission, type PermissionGroup } from '~~/server/utils/permissions'
import { roleDefaultPersona } from '../rolePersona'
import { packForIntent, SKILL_PACKS } from './registry'
import type { ControllerDomain } from './classify'

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

/** Hard cap on L2 fan-out (spec §5.4 cost/latency cap). */
export const MAX_FANOUT = 3

/**
 * L2 planning: map classifier domains → the specialist skill-packs to delegate to, RBAC-PRUNED so a
 * pack the user isn't entitled to is dropped (spec §5.1 — the composed answer can never exceed what
 * the user could get directly). Deduped, fan-out-capped. The caller degrades to L1 when <2 packs survive.
 */
export function planSpecialists(
  domains: ControllerDomain[],
  userRole: string,
  deps: Pick<RouteDeps, 'hasPermission'> = defaultDeps,
): { personas: string[] } {
  const picked: string[] = []
  for (const d of domains) {
    const pack = SKILL_PACKS.find(p => p.domains.includes(d))
    if (!pack) continue
    if (pack.requiredPermission && !deps.hasPermission(userRole, pack.requiredPermission)) continue // RBAC ceiling
    if (!picked.includes(pack.persona)) picked.push(pack.persona)
    if (picked.length >= MAX_FANOUT) break
  }
  return { personas: picked }
}
