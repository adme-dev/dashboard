import type { PortalAiTool } from './portalContext'

/**
 * Per-client portal app-assignment (portal-agent spec §4, locked decision §13.2: agency-managed
 * per-client toggle set). The agent's toolset = (apps enabled for THIS client) ∩ (portal-safe tools).
 *
 * Config NARROWS, never grants — same golden rule as the agency self-service config: a client's
 * enabled-apps list can only SUBTRACT from the portal-safe registry, never add a tool that isn't
 * portal-safe (those simply aren't in the registry to begin with).
 */

/** app key (as used by the portal nav / assignment UI) → the portal tools it unlocks. */
export const PORTAL_APP_TOOLS: Record<string, string[]> = {
  approvals: ['get_my_approvals'],
  projects: ['get_project_status_portal'],
  invoices: ['get_my_invoices'],
  leads: ['get_my_leads'],
  briefs: ['get_my_briefs'],
  'social-reporting': ['get_my_social_report'],
}

/**
 * Narrow the portal registry to the tools unlocked by the client's enabled apps.
 * `enabledApps === null` means "no explicit assignment" → default to the full portal-safe set (every
 * tool stays available). An explicit (possibly empty) array restricts to exactly those apps' tools.
 */
export function narrowPortalRegistryByApps<A>(registry: PortalAiTool<A>[], enabledApps: string[] | null): PortalAiTool<A>[] {
  if (enabledApps === null) return registry
  const allowed = new Set<string>()
  for (const app of enabledApps) {
    for (const tool of PORTAL_APP_TOOLS[app] ?? []) allowed.add(tool)
  }
  return registry.filter(t => allowed.has(t.name))
}

export interface AppAssignmentDb {
  queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null>
}

/**
 * Read a client's enabled portal apps from agency_clients.portal_ai_apps (mig 185).
 * Returns null when unset (→ default-all) or a string[] allowlist. Fail-safe: any error → null.
 */
export async function getEnabledPortalApps(clientId: string, db: AppAssignmentDb): Promise<string[] | null> {
  try {
    const row = await db.queryOne<{ portal_ai_apps: unknown }>(
      `SELECT portal_ai_apps FROM agency_clients WHERE id = $1`, [clientId],
    )
    const v = row?.portal_ai_apps
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
    return null
  } catch {
    return null
  }
}
