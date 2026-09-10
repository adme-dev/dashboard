# Page Studio production setup integration

Integration starts from `162b9675d` on `release/send-scan-foundation`, which includes
the released client-access work and measurement scrolling fix. The owned branch
is `release/page-studio-agency-setup`. The broad business-admin branch is not the
production release base.

## Permission prerequisite

Production routes and role records already use six PAGE_STUDIO permission groups,
but the production source registry omitted them. Role administration validates
against that registry, so it rejected these groups. The legacy `roleHasPermission`
helper also threw for those group names instead of denying a static check.

The integration registers those groups, aligns system-role fallbacks with the
existing migration 402 policy, and keeps website groups separate from legacy
role arrays. Website-only custom permissions must not inherit ADMIN authority.
No live role or permission record was changed.

- New regression before the fix: 7 failed, 1 passed.
- Focused permission, access and role-resolver tests after the fix: 73 passed.
- Full integration suite: 6,778 passed, 39 failed, 26 skipped; 3 unhandled errors.
- Unchanged production base: 6,768 passed, 41 failed, 26 skipped; the same 3 errors.
- Comparison of all failing test labels: no new failures. Two stale role-test
  expectations are corrected (owner group count and owner-only HR lookup).
- Source/new-test lint passes. The full suite is not green; unrelated existing
  failures remain and are not represented as successful verification.
- Typecheck completes with 798 diagnostics versus 823 on the unchanged base:
  no new diagnostics, 25 removed by registering the Page Studio permission type.
  Logs: `/private/tmp/page-studio-production-permissions-typecheck.log` and
  `/private/tmp/page-studio-production-base-typecheck.log`.
- Logs are `/private/tmp/page-studio-production-permissions-{red,green,full,lint}.log`
  and `/private/tmp/page-studio-production-base-full.log`. The first baseline
  attempt lacked generated Nuxt types and ran no tests; Nuxt prepare completed
  before the meaningful baseline run reported above.

## Verified infrastructure prerequisites

Read-only Neon inspection confirms production branch `br-small-hall-a4qtwjgo` in
project `square-tooth-23821574` already contains page_studio_setup_proposals and
the migration 402 system-role Page Studio grants. Git's omission of migration
415 from this release does not mean the live table is absent.

Cloudflare API readback confirms the normal Hyperdrive configuration
`900b4b74ec41462cbbabebd0aa8775aa` has caching enabled. Existing configuration
`90228af3e2cc461bbc09accc3b47bd9f` (`agency-db-fresh`) has caching disabled and
targets the same production Neon endpoint (pooler hostname). The production
source currently binds only the normal connection and aliases queryOneFresh to
queryOne. A real uncached route is required before integrating provisioning
authority. See [Cloudflare query caching guidance](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).
Readback: `/private/tmp/page-studio-production-hyperdrive-readback.jsonl`.

## Outstanding delivery

Integrate and verify the uncached database path, setup APIs/UI, private authority
gateway, environment-scoped provisioning and accepted-plan generation version 2.
The preview producer/authority currently hardcodes staging, so copying it into
production without environment integration is insufficient. Preserve existing
production checkpoint concurrency and AI safeguards.

The editor container rollout still needs a functioning Docker engine. Permission
to restart Docker Desktop remains pending; no restart or reset was performed.
Full retained-job acceptance and the actual Fantasy Limo checkpoint, editor,
reviewed site and stored booking submission remain unproved. Client contact,
pricing, asset and commercial inputs remain required before their dependent
public actions. This report does not claim a new production deployment.
