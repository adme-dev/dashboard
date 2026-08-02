/**
 * Diagnostics for the social OAuth callbacks.
 *
 * Each callback redirects back to the accounts page with a fixed, user-facing
 * reason code (`?social_error=token_exchange_failed`). That contract is fine —
 * the codes are stable and the UI maps them to copy.
 *
 * What was missing is any record of *why*. Every callback used a bare
 * `catch {}`, so the provider's actual error — an expired app secret, a revoked
 * grant, a redirect_uri mismatch, a 5xx from the provider — was discarded at the
 * point of failure. A failed reconnect was undiagnosable from logs alone, which
 * is exactly the wrong property to have while bringing accounts back online
 * after an app review.
 *
 * This only logs. Redirect behaviour is unchanged.
 */
export function logOAuthFailure(
  provider: string,
  reason: string,
  err: unknown,
  clientId?: string
): void {
  const e = err as any
  // Providers disagree on error shape: ofetch puts it on .data, h3 on
  // .statusMessage, Graph nests it under data.error.message.
  const status = e?.response?.status ?? e?.response?.statusCode ?? e?.statusCode ?? e?.status
  const message = e?.data?.error?.message
    ?? e?.data?.error_description
    ?? e?.data?.statusMessage
    ?? e?.statusMessage
    ?? e?.message
    ?? String(err ?? 'unknown error')

  console.warn(
    `[socialOAuth:${provider}] ${reason}`
    + (clientId ? ` client=${clientId}` : '')
    + (status ? ` status=${status}` : '')
    + ` — ${message}`
  )
}
