// Pure helpers for the analytics export-token manager UI.

export const AGENCY_SCOPE_SENTINEL = '__agency__' as const

export function validateTokenLabel(label: string): string | null {
  const trimmed = label.trim()
  if (!trimmed) return 'A label is required'
  if (trimmed.length > 100) return 'Keep the label under 100 characters'
  return null
}

/** USelectMenu uses a sentinel for "agency-wide"; the API wants clientId omitted. */
export function resolveScopeClientId(value: string): string | undefined {
  return value === AGENCY_SCOPE_SENTINEL ? undefined : value
}

export function tokenScopeLabel(token: { client_id: string | null, client_name: string | null }): string {
  if (!token.client_id) return 'Agency-wide'
  return token.client_name ?? `Client ${token.client_id}`
}
