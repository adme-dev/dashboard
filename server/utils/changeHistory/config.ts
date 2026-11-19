import { CLIENT_CHANGE_HISTORY_DEFAULTS, CLIENT_CHANGE_HISTORY_LOCAL_VARIABLE } from '~~/shared/changeHistoryDefaults'

export interface ChangeHistorySwitchSources {
  defaults?: { enabled: boolean }
  processEnv?: Record<string, unknown>
}

/**
 * The per-client change timeline switch. Committed default first (ships false); a local process
 * variable can only ENABLE it for development, and only with the exact string `true`.
 */
export function clientChangeHistoryEnabled(sources: ChangeHistorySwitchSources = {}): boolean {
  const defaults = sources.defaults ?? CLIENT_CHANGE_HISTORY_DEFAULTS
  if (defaults.enabled === true) return true
  const env = sources.processEnv ?? (typeof process !== 'undefined' ? process.env as Record<string, unknown> : {})
  return env[CLIENT_CHANGE_HISTORY_LOCAL_VARIABLE] === 'true'
}
