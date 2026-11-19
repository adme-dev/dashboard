/**
 * CRM search dormancy detection.
 *
 * CRM search (migrations 350–352, `crm_search_*` schema, provider APIs, index
 * queue, Vectorize) is deliberately dormant in production: the Pages deploy
 * guard (`scripts/deploy-pages.mjs` → `assertDormantCrmSearch`) refuses any
 * ordinary deploy unless `CRM_SEARCH_PROVIDER_APIS_ENABLED="false"`, and the
 * search schema migrations are only applied by the signed CRM search release
 * flow (docs/runbooks/crm-search-staged-rollout.md).
 *
 * At runtime the authoritative dormancy signal is therefore the schema itself:
 * a `42P01 undefined_table` error naming a `crm_search_*` relation means search
 * has never been activated in this database. Non-search CRM work (lead
 * promotion, lifecycle, email projection, …) must keep working in that state.
 *
 * If activation has been declared (`CRM_SEARCH_PROVIDER_APIS_ENABLED=true`)
 * yet the schema is missing, that is a broken release — fail closed instead.
 */

export const CRM_SEARCH_DORMANT_SCOPE_ID = 'crm-search-dormant'

interface PgLikeError {
  code?: unknown
  message?: unknown
}

export function isCrmSearchSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as PgLikeError
  return code === '42P01'
    && typeof message === 'string'
    && /\bcrm_search_[a-z_]+\b/u.test(message)
}

export function crmSearchActivationDeclared(
  env: Record<string, unknown> | undefined = typeof process !== 'undefined' ? process.env : undefined
): boolean {
  return env?.CRM_SEARCH_PROVIDER_APIS_ENABLED === 'true'
}

let dormancyLogged = false

/** Logs the dormant-search skip once per isolate (no tenant or record identifiers). */
export function logCrmSearchDormantOnce(purpose: string): void {
  if (dormancyLogged) return
  dormancyLogged = true
  console.info({
    event: 'crm_search_scope_dormant',
    purpose,
    detail: 'crm_search schema absent; trusted CRM work continues without a search scope'
  })
}

/** Test-only: reset the once-per-isolate log latch. */
export function resetCrmSearchDormancyLogForTests(): void {
  dormancyLogged = false
}
