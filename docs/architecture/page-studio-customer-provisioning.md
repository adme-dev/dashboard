# Standalone customer preview provisioning

## Scope and authority

This internal RND-21 adapter connects the native customer account/workspace/site prerequisites to the existing private Studio provisioning engine. It adds no public endpoint, editor grant, billing action or automatic publication. Customer-facing create/progress screens and hosted acceptance remain follow-up work; an executor phase of `complete` is not a customer-facing Ready receipt.

`prepareCustomerProvisioning` accepts only the actual customer session token and a site ID. It derives identity, workspace, business, tenant, staging environment and a content-only starter from retained server records. Migration445 retains one immutable intent per approved preview site. The original identity, login digest, request key, generation, plan and setup remain authoritative across retries. A new login cannot revive a job after the initiating login is revoked; a different owner cannot silently take over its intent.

The distinct `customer-user` actor travels through the Dashboard and Studio provisioning schemas. Its user ID is a verified customer identity, never an invented agency or portal user. Native authority rechecks the session, active account/identity, owner membership, standalone business binding, exact approved preview entitlement and active staff approver. Production, changed plans, foreign scopes and revoked/expired authority fail closed. Permissions are rechecked by the existing executor before provider effects and after uncertain responses.

The initial generation-2 template is content-only: home/about/contact and profile/services, using a supported starter from the retained site. Goals selected during onboarding do not enable operational modules. Provisioning business names accept the same trimmed 1–160 characters as customer signup/site creation. The older interactive setup-request schema remains separate; this adapter does not pass through it.

## Persistence and checkpoint fencing

Control-plane identities, ownership and immutable intent live in platform PostgreSQL. Customer content continues to belong in its independently provisioned database. Existing resource receipts, deterministic ownership checks, lease fencing and lost-response reconciliation are reused.

The first checkpoint commits under the same native customer-authority transaction. Locks follow account → identity → session → workspace/site, matching signup's existing session reads. Customer provenance is recorded under `customerProvisioning` in the private checkpoint audit metadata. It is audit evidence only, and cannot substitute for legacy client staging authority or authorize editing/publication. Never expose retained job/audit payloads directly in a customer status API; return a scoped, sanitized progress model.

## Rollout and recovery

1. Integrate workspace/signup/site ownership prerequisites and apply migration445 after402/442/443/444. The migration is transactional and replayable. Local verification used only owned disposable PostgreSQL17 on loopback port55483, including the `cms_customer_sites_20260930` database.
2. Deploy the customer-aware native authority/checkpoint adapter and matching Studio protocol before enabling any customer producer. This branch alone exposes no producer route. Keep signup activation and production/publication disabled until the complete journey passes acceptance.
3. Prove two hosted customer databases and runtimes with retained provider receipts, correct readback and cross-customer denials. Local SQLite provider-boundary fixtures are evidence of isolation logic, not hosted Cloudflare acceptance.
4. Add customer create/progress/dashboard routes and a separately authorized editor handoff. Recheck fresh access on every read/retry. Do not infer Ready from a successful dispatch or worker upload.

For rollback, stop the customer producer/executor before reverting consumer support. Preserve intents, checkpoints and provider receipts for reconciliation; never allocate a replacement database merely because a response was lost. Revoked original sessions require an explicit future recovery workflow, not replacement of the retained login digest. Existing legacy agency/client jobs retain their own authorization path.

## Verification

- 22 real PostgreSQL tests cover immutable/concurrent intent retention, fresh revocation at every provider phase, forged and cross-customer requests, original-session logout, uncertain coordinator responses, checkpoint replay and logout between preflight and commit.
- Final review identified an opposite lock order and a business-name contract mismatch. A deterministic three-transaction regression and 1/121/160-character name tests failed before the fixes and passed afterward. The name boundaries also pass the Studio protocol tests.
- Studio runs its executor and checkpoint matrices for both client and customer actors. Two independent SQLite databases retain distinct owners/content/routes; providers remain test fixtures.
- Final Dashboard suite: 15,158 passed, 1,612 environment-dependent skipped; the separate CRM route-scan suite passed another54. The initial broad run hit one unrelated pilotEvaluate timeout under simultaneous build/check load; that file passed all58 tests in isolation and the complete rerun was green. Focused ESLint and diff checks pass. Studio build, package/security typechecks, 5,606 Vitest cases and48 action-runtime cases pass.
- Dashboard server typecheck exactly matches the existing289-diagnostic baseline after normalizing worktree paths; it is not a clean project typecheck.
- Full CI/build and final lint status are recorded on the paired draft PRs and canonical customer CMS PRD. No production deployment or hosted Ready claim is made here.

See [site ownership](page-studio-customer-site-ownership.md), [customer signup](page-studio-customer-signup.md), and the canonical PRD in documentation PR601 for the remaining journey.
