# Client Portal Magic-Link Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all client portal password authentication and invitation activation with secure, single-use email magic links.

**Architecture:** A dedicated token table stores SHA-256 digests and lifecycle metadata. Anonymous request and verification endpoints use the existing DB rate limiter, a Cloudflare-first transactional email gateway with Resend fallback, the portal session table, and the cookie boundary; client pages expose only email request and scanner-resistant confirmation actions. Pages calls a private Worker through a service binding, and that Worker alone owns the restricted native Email Sending binding.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Nitro/H3, Neon Postgres, Cloudflare Email Service, Workers service bindings, Resend fallback, Zod, Vitest.

## Global Constraints

- Client links expire after 15 minutes and are single use.
- Client sessions retain the existing 30-day lifetime.
- Raw tokens never enter database storage, server logs, query strings, or production API responses.
- Client and staff authentication remain separate.
- All form fields use Nuxt UI v4 `UFormField`, `UInput`, and `UButton` components.
- Existing password hashes remain stored temporarily but no client-facing endpoint accepts passwords.

---

### Task 1: Token and redirect security primitives

**Files:**
- Create: `server/database/migrations/354_client_portal_magic_links.sql`
- Modify: `server/utils/portalSession.ts`
- Test: `test/server/utils/portalMagicLinkSecurity.test.ts`

**Interfaces:**
- Produces: `generatePortalMagicLinkToken(): string`, `normalizePortalRedirect(value?: unknown): string`, and the `client_magic_link_tokens` persistence contract.

- [ ] Write tests that require a 64-character URL-safe random token, SHA-256 digest compatibility, and rejection of external, protocol-relative, backslash, and non-portal redirects.
- [ ] Run `pnpm vitest run test/server/utils/portalMagicLinkSecurity.test.ts` and confirm the missing exports fail.
- [ ] Implement the token generator, redirect normalizer, and additive migration.
- [ ] Re-run the focused test and apply the migration with `psql` using the repository `.env` connection string.

### Task 2: Magic-link request and delivery

**Files:**
- Create: `server/api/portal/auth/magic-link/request.post.ts`
- Modify: `server/utils/email.ts`
- Test: `test/server/api/portalMagicLinkRequest.test.ts`

**Interfaces:**
- Consumes: token/digest helpers and `checkAndConsume`.
- Produces: `POST /api/portal/auth/magic-link/request` with `{ email, redirect? }`, generic success output, and `sendClientPortalMagicLinkEmail(...)`.

- [ ] Write endpoint tests for validation, dual rate limits, enumeration-safe missing/inactive results, hashed persistence, 15-minute expiry, and one labelled email per eligible tenant account.
- [ ] Run the test and confirm it fails because the endpoint does not exist.
- [ ] Implement the minimal endpoint and client-specific email template without exposing raw tokens outside email delivery.
- [ ] Re-run the focused test.

### Task 3: One-time verification and session issuance

**Files:**
- Create: `server/api/portal/auth/magic-link/verify.post.ts`
- Delete: `server/api/portal/auth/login.post.ts`
- Delete: `server/api/agency/client-portal/auth/login.post.ts`
- Modify: `test/server/utils/portalSessionIssuers.test.ts`
- Test: `test/server/api/portalMagicLinkVerify.test.ts`

**Interfaces:**
- Produces: `POST /api/portal/auth/magic-link/verify` with `{ token, redirect? }`; returns `{ success: true, redirect }` and sets `client_session_token`.

- [ ] Write endpoint tests for digest lookup, atomic consumption, expiry/reuse/inactive rejection, pending activation, matching invitation acceptance, session digest storage, secure cookie options, and redirect sanitisation.
- [ ] Run the tests and confirm the missing endpoint fails.
- [ ] Implement verification and remove both obsolete client password-login routes.
- [ ] Update the session issuer contract and re-run both focused suites.

### Task 4: Passwordless invitation activation

**Files:**
- Modify: `server/api/portal/auth/accept-invite.post.ts`
- Modify: `app/pages/portal/accept-invite.vue`
- Test: `test/server/api/portalInviteMagicLink.test.ts`
- Test: `test/app/portalInvitePage.test.ts`

**Interfaces:**
- `POST /api/portal/auth/accept-invite` consumes only `{ token }`, activates the account, creates a session, and returns `{ success, redirect }`.

- [ ] Write server and source-contract tests proving password input and bcrypt are absent while activation and indexed session issuance remain.
- [ ] Run tests and confirm they fail against the legacy password flow.
- [ ] Implement transactional invitation activation/session creation and rebuild the page with an explicit Nuxt UI confirmation action.
- [ ] Re-run focused tests.

### Task 5: Client login and verification UI

**Files:**
- Modify: `app/composables/usePortalAuth.ts`
- Modify: `app/pages/portal/login.vue`
- Create: `app/pages/portal/magic-link.vue`
- Modify: `test/app/portalLoginPage.test.ts`
- Test: `test/app/portalMagicLinkPage.test.ts`

**Interfaces:**
- Produces: `requestMagicLink(email, redirect?)` and `verifyMagicLink(token, redirect?)` composable actions.

- [ ] Update source-contract tests to require an email-only login, generic sent state, fragment token handling, explicit confirmation, Nuxt UI components, and no password controls.
- [ ] Run tests and confirm the legacy login fails.
- [ ] Implement the email request and confirmation pages following the approved restrained access-surface design.
- [ ] Re-run focused UI tests.

### Task 6: Documentation, full verification, and release

**Files:**
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/pages/platform/client-portal.vue`
- Modify: `app/pages/resources/client-portal-admin.vue`

- [ ] Replace password onboarding and credential copy with accurate magic-link, one-time-link, and secure-cookie language.
- [ ] Re-read every changed file; check server aliases, redirect validation, token leakage, form controls, dark mode, and duplicate UI.
- [ ] Run focused tests, relevant portal auth tests, ESLint on changed files, `git diff --check`, `pnpm deploy:check`, and `pnpm build` under Node 24.18.0.
- [ ] Commit atomically, review the branch, merge through a PR, deploy only with `pnpm deploy:production`, and smoke-test the live public pages.
