/**
 * Reviewed, versioned switch for the per-client change timeline (marketing automation governance,
 * phase 4: `.planning/todos/008-marketing-automation-governance.md`).
 *
 * Production Pages sits at Cloudflare's 150 text-binding ceiling, so this switch is committed here
 * instead of adding a new production variable (same pattern as shared/aiAssistantDefaults.ts).
 * It ships OFF. Turning it on is an explicit, reviewed code change (needs Paul's go-ahead): set
 * `enabled: true` here and redeploy. A local `CLIENT_CHANGE_HISTORY_ENABLED=true` process variable
 * is honoured for development only; production has no binding slot for it.
 *
 * The switch gates exposure only. Every read still runs the client-scoped reporting authority
 * (owner God mode, management, or marketing staff with `reporting` for clients they cover).
 */
export const CLIENT_CHANGE_HISTORY_DEFAULTS = {
  enabled: false
} as const

export const CLIENT_CHANGE_HISTORY_LOCAL_VARIABLE = 'CLIENT_CHANGE_HISTORY_ENABLED'
