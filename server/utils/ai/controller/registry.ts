import type { AiIntent } from '~/types'
import type { PermissionGroup } from '~~/server/utils/permissions'

/**
 * Capability registry for the traffic controller (Phase 3, traffic-controller spec §4). Each entry
 * maps a skill-pack (a persona key) to the request domains/intents it is the best home for, plus the
 * RBAC permission a user needs for the pack's tools to be useful. The L1 router (route.ts) reads this
 * to auto-select ONE pack per turn by intent+role; L2 will reuse `domains` for cross-domain decomposition.
 *
 * `persona` MUST be a real key in `personas.ts`. `requiredPermission` is the gate the router checks so
 * it never routes a user to a pack whose tools RBAC would strip (e.g. a media_buyer → finance). Packs
 * with no clean intent signal (media_buyer, marketing, sales for ad/social) carry `intents: []` and are
 * reached via the role-default, not intent routing — until a finer intent vocabulary exists.
 */
export interface SkillPackCapability {
  persona: string
  domains: string[]
  intents: AiIntent[]
  requiredPermission?: PermissionGroup
}

export const SKILL_PACKS: SkillPackCapability[] = [
  { persona: 'finance', domains: ['finance'], intents: ['financial_query'], requiredPermission: 'FINANCE' },
  { persona: 'account', domains: ['accounts', 'delivery'], intents: ['task_query', 'project_query', 'brief_query', 'team_query'], requiredPermission: 'CLIENTS' },
  { persona: 'sales', domains: ['sales'], intents: ['pricing_query'], requiredPermission: 'SALES' },
  { persona: 'media_buyer', domains: ['media', 'adspend'], intents: [], requiredPermission: 'MEDIA_BUYING' },
  { persona: 'marketing', domains: ['marketing', 'social'], intents: [], requiredPermission: 'CLIENTS' },
]

/** First pack that serves `intent` and the role is entitled to, or null. */
export function packForIntent(
  intent: AiIntent | null | undefined,
  hasPermission: (group: PermissionGroup) => boolean,
): SkillPackCapability | null {
  if (!intent) return null
  return SKILL_PACKS.find(p =>
    p.intents.includes(intent) && (!p.requiredPermission || hasPermission(p.requiredPermission)),
  ) ?? null
}
