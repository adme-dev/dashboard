# Verified code-page checkpoints and staging

## Scope

Accept reviewed private code-page packages as native checkpoints without treating
the retained typed compatibility manifest as the imported website. Preserve full
scope, operation, content and checkpoint bindings through acceptance and staging.
The paired Page Studio branch is `feat/code-page-native-preview-20261105`.

Kia is intended for Automotive Templates. Northwall Arc is an automotive template.
Fantisy Limo, Fantasea, Mornington and Yarra Valley are individual sites, not
catalogue templates; preserve them separately.

## Implemented candidate

- Native acceptance independently verifies the private import records, reviewed
  package and accepted metadata before a locked compare-and-set.
- Retries compare complete bindings and retain the original receipt. Typed AI
  acceptance refuses code-bound inputs, current/base checkpoints and reused code
  targets, including historical replay and lock-wait races.
- Migration 500 adds code-content bindings to staging state. Explicit updates can
  build imported pages; automatic typed-build paths exclude imported checkpoints.
- Saved-page management shows verified imported routes as read-only. Standalone
  management shows the exact saved count and disables unsupported editor launch.
- Staging UI acknowledges only a newly active snapshot matching the requested
  digest and complete content binding; stale responses retain the retry identity.

## Verification checkpoint

514 affected tests passed across 26 suites, including real local PostgreSQL
acceptance/staging/outbox/AI tests and Vue interaction tests. The disposable
PostgreSQL staging-authority harness was updated to run migration 500 before its
assertions. Management Worker typecheck and scoped lint passed. Independent source
review of standalone presentation and staging acknowledgement found no supported
consequential issue. Full application build/typecheck and release checks are still
in progress; no full-suite or hosted acceptance is claimed here.

The previous bounded Nuxt typecheck exceeded its 4 GiB heap. The new full checks
use the repository's 16 GiB setting. Database tests use disposable local PostgreSQL;
no remote migration, credentials, deployment or publication was performed.

## Open acceptance

- [ ] Full release checks and exact-head CI.
- [ ] Actual hosted import and cold reopen of the reviewed Kia package.
- [ ] Off-Mac signed-out public preview, update, failed-update retention and withdrawal.
- [ ] Standalone template catalogue, immutable selected-version preview and independent copy.
- [ ] Hosted imported-code editing and manual save/reload/restore without AI.

The management URL and local fixture pipeline do not establish a public Kia URL.
