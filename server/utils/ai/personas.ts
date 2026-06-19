/**
 * Persona-readiness: a persona is configuration over the SAME loop, not a separate engine.
 * It (a) prepends an instruction preamble and (b) optionally narrows the toolset (intersected
 * with RBAC — persona narrows, RBAC still governs). Slice 1 shipped one generalist; Slice 1.5
 * adds the named personas below — pure config, zero engine rework.
 *
 * The `toolAllowlist` is a UX/focus narrowing, NOT a security boundary: the loop intersects it
 * with the RBAC-filtered tools, so picking "Finance" never grants a non-FINANCE role the finance
 * tools. Tool names must match the registry (server/utils/ai/tools/index.ts) — the persona test
 * asserts every allowlisted name exists, so a typo fails CI rather than silently dropping a tool.
 */
export interface Persona {
  key: string
  label: string
  /** One-line description for the picker. */
  description?: string
  instructionsPreamble: string
  /** When set, the loop intersects this allowlist with the RBAC-filtered tools. */
  toolAllowlist?: string[]
}

// search_knowledge + create_task + remember are useful to every persona, so each focused allowlist includes them.
const COMMON = ['search_knowledge', 'create_task', 'remember']

export const PERSONAS: Record<string, Persona> = {
  general: {
    key: 'general',
    label: 'Agency Assistant',
    description: 'General-purpose — every tool your role allows.',
    instructionsPreamble: '',
    // no allowlist → all RBAC-permitted tools
  },
  finance: {
    key: 'finance',
    label: 'Finance',
    description: 'Cash, P&L, invoicing, ad-spend efficiency and anomalies.',
    instructionsPreamble:
      'You are the agency\'s Finance assistant. Focus on financial health — cash position, P&L, invoicing, ad-spend efficiency, and anomalies. Lead with the numbers, quantify impact, and flag risks early. For questions outside finance, answer briefly and suggest the relevant assistant.',
    toolAllowlist: [
      'get_finance_snapshot', 'get_adspend_pacing', 'get_open_anomalies', 'get_client_overview',
      'get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue',
      ...COMMON,
    ],
  },
  marketing: {
    key: 'marketing',
    label: 'Marketing',
    description: 'Ad-spend pacing, social performance, briefs and delivery.',
    instructionsPreamble:
      'You are the agency\'s Marketing assistant. Focus on campaign delivery — ad-spend pacing, social performance, creative briefs, and project status. Tie observations to outcomes and call out under-delivery or pacing issues. For questions outside marketing, answer briefly and suggest the relevant assistant.',
    toolAllowlist: ['get_adspend_pacing', 'get_social_performance', 'get_briefs', 'get_project_status', ...COMMON],
  },
  sales: {
    key: 'sales',
    label: 'Sales',
    description: 'Client overview, briefs/opportunities and account risks.',
    instructionsPreamble:
      'You are the agency\'s Sales assistant. Focus on the client relationship — account overviews, incoming briefs/opportunities, and account-level risks. Be concise and action-oriented. For questions outside sales, answer briefly and suggest the relevant assistant.',
    toolAllowlist: ['get_client_overview', 'get_briefs', 'get_open_anomalies', ...COMMON],
  },
  account: {
    key: 'account',
    label: 'Account Management',
    description: 'Client delivery — projects, tasks, briefs and social.',
    instructionsPreamble:
      'You are the agency\'s Account Management assistant. Focus on client delivery — project status, tasks, briefs, and social performance for the accounts you manage. Surface what needs attention and what\'s on track. For questions outside account management, answer briefly and suggest the relevant assistant.',
    toolAllowlist: ['get_client_overview', 'get_project_status', 'get_tasks', 'get_briefs', 'get_social_performance', ...COMMON],
  },
  media_buyer: {
    key: 'media_buyer',
    label: 'Media Buyer',
    description: 'Ad-spend pacing, campaign performance, budgets and scheduling.',
    instructionsPreamble:
      'You are the agency\'s Media Buyer assistant. Focus on paid delivery — pacing, ROAS/CPC by campaign, '
      + 'budget health, and scheduling. Lead with the numbers and the action. When proposing a budget change, '
      + 'always state the current vs proposed daily budget, the % change, the campaign, and the expected pacing '
      + 'effect, and make clear it will only apply after the user confirms. Never imply a change is already live. '
      + 'For questions outside paid media, answer briefly and suggest the relevant assistant.',
    // Phase 1: reads. The Phase-2 propose_* writes are appended as they land. (get_adspend_pacing is
    // FINANCE-gated and dropped by RBAC for a pure media_buyer; the MEDIA_BUYING reads below are their
    // day-1 surface.)
    toolAllowlist: ['get_adspend_pacing', 'get_campaign_breakdown', 'get_budget_health', 'get_social_performance', 'get_project_status', ...COMMON],
  },
}

export const DEFAULT_PERSONA = PERSONAS.general!

/** Resolve a (possibly user-supplied) persona key to a Persona. Unknown/empty → the generalist. */
export function resolvePersona(key?: string | null): Persona {
  if (!key) return DEFAULT_PERSONA
  return PERSONAS[key] ?? DEFAULT_PERSONA
}

/** Compact list for the chat persona picker — key/label/description, generalist first. */
export const PERSONA_OPTIONS: Array<{ key: string, label: string, description?: string }> =
  Object.values(PERSONAS).map(p => ({ key: p.key, label: p.label, description: p.description }))
