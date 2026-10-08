# Standalone customer signup and business setup

## Scope and entry points

This disabled-by-default preview implements the account and workspace portion of the customer CMS journey. It builds on `page-studio-customer-workspaces.md` and canonical PRD tasks RND-18, RND-19 and part of RND-20. It does not provision a website, customer content database, subscription or publishing domain.

| Entry | Identity and destination |
| --- | --- |
| `/studio` | Existing invited client login; existing portal session and assigned sites |
| `/studio/signup` | Standalone customer signup or passwordless sign-in |
| `/studio/signup/verify` | Explicit one-use email-link confirmation |
| `/studio/onboarding` | Saved business details, goals, and one workspace receipt |
| XeroFlow Agency | Existing staff login and agency permissions; unchanged |

Email address equality grants no access to existing portal identities, clients or sites. New accounts obtain a verified `studio` identity only when they consume a valid link. Account metadata is refreshed only for pending accounts and is tied to the latest link; anonymous requests cannot alter active profiles or consent records.

Accounts, sessions, workspace ownership and setup progress are control-plane records in the platform database. Customer content, enquiries, forms, media metadata and operational CMS data still require the customer's own database under the PRD's separate provisioning phase.

## Security and consistency

- API prefix `/api/portal/page-studio/customer/` deliberately uses the existing private/no-store portal headers and exemption from staff auth. Every protected handler independently requires its dedicated customer cookie and fresh database authorization.
- The cookie is host-only, HttpOnly, SameSite=Lax, Secure for HTTPS, with a 30-day expiry. Neither staff nor portal cookies substitute for it. Logout revokes the server session and clears the cookie.
- Mutation requests require an exact Origin match to the configured product origin. Email links use that configured origin, never forwarded host input or a caller-provided redirect. Verification tokens appear only in email URL fragments, are cleared from browser history on mount, and require an explicit POST.
- Random tokens have 48 bytes of entropy. Only SHA-256 digests are stored. Links expire after 15 minutes; resending invalidates preceding links. Verification and session/identity creation share a transaction. Account-first locking serializes resends and concurrent verification.
- Request and verification limits use the shared database limiter in fail-closed mode. Request responses are generic for ineligible and absent accounts. Delivery failures log a fixed message without recipient, token or provider details. Cloudflare transactional email is preferred with the existing Resend fallback.
- Setup is revisioned and isolated by the session identity. Completion uses a persisted creation request UUID, atomically creates an owned workspace, and returns the same receipt on retry. Reading or retrying a completed setup rechecks workspace access.
- Customers can save incomplete drafts, reload saved answers, recover from revision conflicts and explicitly sign out without saving after setup failures. Goals describe intent; choosing bookings or sales does not activate a paid feature.

## Configuration and activation

All four settings must be supplied explicitly. Cloudflare request environment bindings take precedence over process environment values.

| Setting | Value |
| --- | --- |
| `PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED` | Exactly `true` to expose the preview API; otherwise off |
| `PAGE_STUDIO_CUSTOMER_ORIGIN` | Exact HTTPS origin, no trailing slash/path/query/credentials |
| `PAGE_STUDIO_CUSTOMER_TERMS_VERSION` | Operator-approved version identifier, 1–100 characters |
| `PAGE_STUDIO_CUSTOMER_EMAIL_FROM` | Verified sender email address supported by the configured transport |

For controlled acceptance, configure both `PAGE_STUDIO_CUSTOMER_SIGNUP_EMAIL_HASHES`
(a JSON array of 1–10 SHA-256 hex digests of trimmed, lowercase addresses; at most
1,024 characters) and `PAGE_STUDIO_CUSTOMER_SIGNUP_EXPIRES_AT` (UTC ISO timestamp).
Unapproved signup/sign-in requests retain the generic response but cannot create
accounts, rotate tokens or send mail. Partial, malformed or expired configuration
closes the native signup/session/setup boundary. With neither setting supplied,
ordinary enabled signup retains its existing behavior. This controls admission of
new mail requests, not revocation of existing sessions before the deadline. Hashes
avoid plaintext addresses in configuration; they are not anonymization or secrets.

HTTP loopback origins are allowed only in a Nuxt development build. Apply migrations 442 and 443 to the intended platform database before enabling. Validate transactional email delivery, legal-page suitability for the standalone product, data retention/cleanup for expired tokens and pending accounts, abuse controls, deployment source and domain routing in staging before public activation. The local acceptance fixture was removed before commit; it is never part of a deployment.

This implementation does not announce self-service signup on public marketing pages because it remains a gated preview. Update marketing and the `/studio` entry when the complete customer provisioning journey is ready to open.

## Verification evidence — 30 September 2026

- 72 focused tests: 13 real PostgreSQL signup/setup, 23 real PostgreSQL workspace ownership, 14 HTTP boundaries, 3 mounted onboarding recovery, 3 email transport/template and 16 existing portal regressions. Migrations were applied twice in isolated schemas and migration443 was also applied to the disposable local database.
- The two final-review findings were reproduced as four failing tests before fixes: pending-account metadata and sign-out after failed/conflicting setup. The full focused suite passed after fixes.
- Real Chrome with a disposable loopback PostgreSQL database and captured mail: signup layout, explicit email verification, business setup save/reload, goals selected by pointer and keyboard, 390px mobile layout, workspace completion and receipt reload. No real email or production data was used. A checklist label-ID issue found in Chrome was fixed using Nuxt UI's checkbox group.
- Focused ESLint and whitespace checks. Server TypeScript diagnostics match the existing 289-error baseline after normalizing absolute worktree paths. Full frontend TypeScript checking exceeded the default heap and was stopped on the larger-heap retry during disk cleanup; it is not claimed passing. Browser compilation and mounted Vue tests passed. Full CI/build status is tracked on the PR.

## Remaining journey

Finish customer site creation and own-database provisioning, connect the customer workspace/dashboard and Page Studio launch authorization, then activate the end-to-end preview. Custom domains, subscriptions/AI credits, team invitations and operational CMS modules remain separate PRD work. No public activation or production migration is performed by this change.

## Guided entry preview — 8 October 2026

The gated signup page now asks for the website topic, then website goals, then account creation. Automotive is included, and the 14 goal choices are planning preferences, not feature activation. Existing customers can open email sign-in directly. Google and Apple are not configured for native customer authentication and are not presented as working options.

After an email request succeeds, validated topic/goal preferences are stored locally for at most 24 hours, bound to the normalized email. No bearer tokens are stored. After verification, only a matching verified email with a revision-zero setup can restore these preferences. Existing server drafts remain authoritative. The customer adds their business name/timezone and completes the existing revisioned setup flow. Preferences are removed after a successful save. Blocking local storage or opening the link in another browser falls back to the normal setup questions; the inbox screen explains the same-browser requirement.

Desktop topics fill available space above the fixed action footer and show a custom overflow scrollbar. Goal tiles become a single column on narrow screens. Original generated abstract artwork is stored at `public/images/studio/artistic-panel.webp`.
