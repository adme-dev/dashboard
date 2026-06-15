/**
 * Resolve the Google Ads `login-customer-id` (manager / MCC). Mirror of
 * `resolveGoogleManagerId` in spendSync.ts, inlined here so this module pulls in
 * no DB-backed dependency (keeps it genuinely unit-testable without Nitro).
 * Configured value wins; otherwise pick an accessible customer that isn't the
 * connected client account. Dashes stripped.
 */
function pickManagerId(opts: { configured?: string | null; accessibleIds?: string[]; connectionAccountIds?: Set<string> }): string | undefined {
  const norm = (s: string) => s.replace(/-/g, '')
  const configured = opts.configured ? norm(opts.configured) : ''
  if (configured) return configured
  const accessible = (opts.accessibleIds || []).map(norm).filter(Boolean)
  const connected = opts.connectionAccountIds || new Set<string>()
  return accessible.find(id => !connected.has(id)) || accessible[0] || undefined
}

/**
 * Resolve a usable Google Ads access token + manager (login-customer-id) for a
 * WRITE (or single-campaign refresh) against one connection.
 *
 * The spend-sync path already does this per account; the budget-write execute
 * endpoint historically used the stored `access_token` verbatim with only a
 * configured MCC. Google access tokens expire ~hourly, so a stored token is
 * almost always stale by the time an admin clicks Apply — the write then 401s.
 * And client accounts under a manager 403 without the login-customer-id header.
 * This mirrors `processGoogleConnection`'s token-refresh + MCC auto-detect so
 * the write path authenticates exactly like the (now-verified-working) reads.
 *
 * Orchestration over injected deps — no DB or network imports of its own — so
 * it unit-tests without Nitro.
 */

export interface GoogleWriteConn {
  id: string
  account_id: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

export interface GoogleWriteConfig {
  googleClientId: string
  googleClientSecret: string
  googleDeveloperToken: string
  googleAdsLoginCustomerId?: string | null
}

export interface GoogleWriteAuthDeps {
  refreshGoogleToken: (refreshToken: string, clientId: string, clientSecret: string) => Promise<{ access_token: string; expires_in: number }>
  listAccessibleCustomers: (token: string, developerToken: string) => Promise<string[]>
  /** Persist a freshly-refreshed access token for the connection. */
  updateToken: (connectionId: string, accessToken: string, expiresAt: Date) => Promise<void>
}

export async function resolveGoogleWriteAuth(
  conn: GoogleWriteConn,
  config: GoogleWriteConfig,
  deps: GoogleWriteAuthDeps,
): Promise<{ accessToken: string; loginCustomerId: string | undefined }> {
  let accessToken = conn.access_token

  // Refresh if the token is expired or expires within 5 minutes.
  if (conn.refresh_token && conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at)
    if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      const refreshed = await deps.refreshGoogleToken(conn.refresh_token, config.googleClientId, config.googleClientSecret)
      accessToken = refreshed.access_token
      await deps.updateToken(conn.id, accessToken, new Date(Date.now() + refreshed.expires_in * 1000))
    }
  }

  // Resolve the manager (login-customer-id). Configured value always wins;
  // otherwise auto-detect an accessible customer that isn't this client account.
  let loginCustomerId: string | undefined
  const configured = config.googleAdsLoginCustomerId || ''
  if (configured) {
    loginCustomerId = pickManagerId({ configured })
  } else {
    try {
      const accessibleIds = await deps.listAccessibleCustomers(accessToken, config.googleDeveloperToken)
      loginCustomerId = pickManagerId({
        accessibleIds,
        connectionAccountIds: new Set([conn.account_id.replace(/-/g, '')]),
      })
    } catch (err: any) {
      // Degrade to no manager header (the write path then tries directly-owned),
      // but log — for a managed account this guarantees a first-attempt 403, and
      // this code writes live money, so the swallowed cause must be diagnosable.
      console.warn(`[GoogleWriteAuth] MCC auto-detect failed for account ${conn.account_id}:`, err?.message || err)
      loginCustomerId = undefined
    }
  }

  return { accessToken, loginCustomerId }
}
