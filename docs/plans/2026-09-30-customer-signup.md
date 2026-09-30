# Verified customer signup and resumable setup

Implements the approved next slice of the customer CMS PRD (RND-18/19 and workspace creation portion of RND-20), building on PR #602. No agency registration or client account is created.

## Design

- Dedicated standalone account records reference verified `studio` identities. Reuse the existing secure random-token/digest helpers and Cloudflare/Resend transactional transport. Portal and staff sessions remain separate; an email match never merges accounts or grants an existing customer's sites.
- Signup requests require explicit terms acknowledgement and return a generic result. Sign-in requests never create an account. Tokens expire after 15 minutes, store only digests, and are consumed atomically with identity/session creation. Verification is an explicit POST, not a GET or automatic email-scanner action.
- A configured trusted product origin controls links and mutation Origin checks. Flag off by default; production requires HTTPS and configured email. No caller-selected return destination, tenant, identity or role. Use a dedicated HttpOnly, host-only session cookie, fresh active-account/identity checks and logout revocation.
- Signup, verification and a two-step business setup use Nuxt UI, semantic colours, existing typography and a restrained single-column form. Step one records business name/type/timezone; step two records visitor goals and review. Drafts persist server-side with revision conflicts. Completing setup atomically creates one workspace and preserves an idempotent receipt.
- The final screen honestly reports a prepared workspace; website provisioning/editor access is a subsequent slice, not a simulated success. Existing invited customer login stays at `/studio`; standalone signup/login at `/studio/signup`, verification at `/studio/signup/verify`, setup at `/studio/onboarding`.
- APIs under `/api/portal/page-studio/customer/` use their own session guard; existing portal security headers and staff middleware exemptions apply. They do not accept portal/staff cookies as standalone authority.

## Verification plan

- Real local PostgreSQL: case-normalized duplicate signup, login without account creation, one-use/expired/resend tokens, transaction rollback, suspended accounts/identities, session expiry/logout, concurrent verification, draft revision conflicts, independent owners and repeat completion.
- Endpoint tests: flag/origin/rate limits, generic responses, cookie attributes, no token disclosure, provider failure handling and authenticated setup boundaries.
- Real local browser: signup empty/loading/sent/error states, verification and persisted setup where isolated adapters are available; mobile/keyboard UI. No real customer emails or production data.
- Existing portal magic-link and workspace suites remain green; focused lint and baseline comparison for TypeScript.
- Review, document, commit and push a draft PR. Update canonical PRD with precise tested scope and remaining activation steps.

## Execution

Implemented as a gated preview. Product-origin/terms/email configuration is operator-supplied; local tests use synthetic data and captured mail. Customer credentials or content are never copied from production. See `../architecture/page-studio-customer-signup.md` for scope, verification and activation requirements.

### 30 September — disk-space cleanup interruption

Implementation is uncommitted in `/private/tmp/dashboard-customer-signup-20260930` on `feature/studio-customer-signup`. Keep this active worktree. 49 DB/HTTP tests pass (12 signup PostgreSQL, 23 workspace PostgreSQL, 14 HTTP). Applied migration443 to disposable local PostgreSQL on127.0.0.1:55483. Browser verified signup screen, captured-email token verification and navigation to onboarding. Save/resume browser acceptance is unfinished after local Nuxt exhausted the default heap; restarted with16GB on3016. Temporary untracked `server/plugins/customer-signup-local-test.ts` injects ONLY disposable local DB and captured email; DELETE before commit/deployment. `.env` contains only the disposable DB URL.

Fresh reviewer `review_customer_signup` requests two fixes before commit:
1. Pending account name/terms currently first-writer-wins: update pending-only name, terms_version and terms_accepted_at under account lock before token rotation; add RED→GREEN test, preserve active account metadata.
2. Initial setup403/500 or revision conflict disables logout and redirects into a loop. Allow independent logout without draft save in those states; cover regression.

Server typecheck289 errors matches baseline; full frontend typecheck exceeded default heap,16GB retry was stopped for urgent disk cleanup. Focused lint one compact statement was corrected; rerun. Email test token URL split was corrected after one test assertion failed; rerun3 email tests plus16 portal regression tests. Remaining: reviewer fixes, browser save/resume/completion/mobile, targeted lint/tests/typecheck, delete fixture plugin, architecture/activation docs, commit/push draft PR, update canonical PRD in docs worktree. Do not claim production enabled or a website provisioned.

### Final verification

- Final: fixed pending-account metadata — `refreshes pending signup metadata with the link being verified, but never changes an active account` RED→GREEN.
- Final: fixed blocked sign-out — mounted Vue cases for403,500 and409 RED→GREEN.
- Focused suite72/72 passed after fixes. Browser completed saved/reloaded business setup, keyboard goal selection,390px layout and one workspace receipt.
- Browser-found checkbox ID collision corrected with `UCheckboxGroup`; all goal labels now resolve independently.
- Ruling: retain the disabled preview without public marketing promotion until provisioning and activation checks pass — advertising a complete signup journey now would overstate its capability. Cost: public discovery is deferred to the activation change.
- Full frontend typecheck is resource-limited, not passing; retain this limitation in the PR. Server289-error baseline is unchanged.
