// server/utils/turnstile.ts
// Cloudflare Turnstile (CAPTCHA) server-side verification for public,
// unauthenticated forms — currently the email-marketing subscribe form, to stop
// it being used to mail-bomb arbitrary addresses with double-opt-in confirms.
//
// Gated on config presence: when TURNSTILE_SECRET_KEY isn't set the check is a
// no-op (isTurnstileEnabled() === false), so this can ship inert and activate
// the moment the operator creates a widget and sets the keys. On CF Pages the
// secret arrives via the binding (cached by the cfEnv middleware), not
// process.env — mirror the other secret reads.

import { getCachedBinding } from '~~/server/utils/email'

export function turnstileSecret(): string | undefined {
  return process.env.TURNSTILE_SECRET_KEY || getCachedBinding('TURNSTILE_SECRET_KEY')
}

export function isTurnstileEnabled(): boolean {
  return !!turnstileSecret()
}

// Pure: a Turnstile siteverify response is a pass ONLY when `success === true`
// (strict boolean). Anything else — success:false, missing field, string,
// non-object — is a fail.
export function turnstileVerdict(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { success?: unknown }).success === true
}

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Verify a client token with Cloudflare. Assumes the caller already checked
// isTurnstileEnabled(); fails CLOSED on a missing token or any network/parse
// error so a verification outage can't be used to bypass the check.
export async function verifyTurnstile(token: string | undefined | null, remoteip?: string): Promise<boolean> {
  const secret = turnstileSecret()
  if (!secret || !token) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (remoteip) body.set('remoteip', remoteip)
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body })
    return turnstileVerdict(await res.json())
  } catch {
    return false
  }
}
