# Client Portal Magic-Link Authentication Design

## Outcome

Replace password authentication for every client portal user with email magic links. Staff authentication remains separate. Existing password hashes remain temporarily for rollback and data migration safety, but no client-facing page or public portal endpoint accepts a password.

## User experience

- `/portal/login` asks only for an email address and always confirms that a link will be sent if an eligible account exists.
- A link expires after 15 minutes and can be used once.
- The raw token is placed in the URL fragment on `/portal/magic-link`, keeping it out of HTTP request logs and referrers.
- The verification page requires an explicit **Continue to portal** action, preventing ordinary email-security prefetchers from consuming the credential.
- A verified user receives the existing 30-day `client_session_token` cookie and returns to a validated `/portal` destination.
- If one email belongs to more than one client, the recipient gets one clearly client-labelled link for each eligible account rather than the system choosing a tenant implicitly.
- Portal magic links and invitations use Cloudflare Email Sending through a private Worker service binding. The binding is restricted to `notification@adme.net.au`; Pages holds no Cloudflare Email API credential. Resend remains an automatic fallback for unavailable or retryable Cloudflare outcomes while the service is in beta, but permanent suppression and sender-policy failures are never bypassed.
- New invitation links activate the invited account and issue the same portal session without asking for a password.

## Security contract

- Generate 48 random bytes with Web Crypto and store only a SHA-256 digest.
- Store portal magic-link credentials in a dedicated `client_magic_link_tokens` table, separate from staff authentication.
- Consume a token atomically with session creation; expired, consumed, suspended, and deactivated accounts fail.
- Rate-limit requests by normalized email and source IP. The request response never reveals whether an account exists.
- Do not include tokens in API responses outside local development, application logs, query strings, or analytics.
- Accept only local `/portal` redirects and fall back to `/portal` for malformed or external destinations.
- Set the existing session cookie as `httpOnly`, `SameSite=Lax`, secure on HTTPS/production, path `/`, with a 30-day lifetime.
- Record request-independent login success in `client_activity_log`; never record the raw token.

## Data and lifecycle

`client_magic_link_tokens` records the client user, token digest, expiry, consumption time, request IP, user agent, and creation time. Issuing a new link consumes prior unused links for that user. A successful verification activates a pending invited user, verifies their email, marks a matching pending invitation accepted, and updates normal login counters.

Existing password hashes are deliberately not deleted in this release. The password endpoint and client password fields are removed from the active product surface; hashes can be removed in a later irreversible migration after the rollout is proven.

## Interface and content direction

The login remains a restrained XeroFlow access surface, not a marketing landing page. Its signature element is a small email-to-secure-workspace sequence that explains the two-step journey without decorative clutter. It uses existing black/white/semantic portal colors and Nuxt UI v4 controls, with concise client-side language: “Email me a sign-in link”, “Check your inbox”, and “Continue to portal”.

## Operations and verification

- Apply the additive migration before deployment.
- Test request enumeration resistance, multi-tenant email handling, token hashing, expiry, one-time consumption, pending activation, inactive rejection, safe redirects, cookies, UI password removal, and invitation activation.
- Update the Client Portal feature and administration pages so public documentation describes magic links rather than passwords.
- Build, deploy the private transactional email Worker before the guarded `pnpm deploy:production` command, and smoke-test the public login and verification pages without sending a real customer email.
