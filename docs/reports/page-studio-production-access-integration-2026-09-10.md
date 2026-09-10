# Client website access on the production release

## Result and scope

Integration branch `release/page-studio-client-access` starts at production
`1c609fe93` (`release/send-scan-foundation`). It adds audited manual access grants,
agency client draft creation, the five business starter identifiers, the Client
websites navigation label and a scrolling portfolio page. It preserves every
production checkpoint/AI acceptance safeguard, measurement scrolling fix and
Google review change. There is no wholesale feature-branch merge.

The source feature branch `84127b341` differs from production in more than a
thousand commits. Its Page Studio control store would remove production's CAS
activation fence and retry/base identity checks. Those files and their tests
remain byte-for-byte unchanged in this integration. Business content/admin,
booking operations, provisioning and runtime releases are still separate pending
integration work; a saved draft alone does not activate them.

## Audit prerequisite

The production branch lacks migration 301, although the configured live database
already has `billing_entitlement_audit`. Standalone migration 416 creates only
that compatible audit table if absent, adds the scoped retry index, and prevents
updates/deletes of Page Studio access audit records. It does not install unrelated
billing plans or usage features. Migration 416 was applied automatically to the
configured database and independently verified: append-only trigger enabled and
request index present. No customer access grant was created by the migration.

The PostgreSQL test now uses migration 416 directly and verifies grant races,
tenant-separated replay, rollback and append-only evidence. No God-mode inventory
was transplanted because that system is absent from the production source.
Existing Page Studio permission checks still authorize the endpoint.

## Verification

- 87 focused tests pass, including all five business starter requests, five real
  PostgreSQL cases, permission denial, lost-response replay, concurrent grants,
  existing checkpoint CAS/legacy cutoff and AI acceptance tests.
- Full integration suite: 6,773 passed, 41 failed, 21 skipped, three unhandled
  rejections. A separately extracted and prepared unchanged production checkout
  using identical dependencies reproduces exactly the same 41 failing cases and
  three rejections: 6,735 passed, 41 failed, 21 skipped. There are no added failing
  test cases. Failures span existing email, media, role, spend and config tests.
- Functional changed-file ESLint passes. Marketing/layout lint has 53 findings;
  rule/message/count comparison against unchanged production proves the same 53.
- The first baseline run lacked generated Nuxt types. It was invalid as evidence;
  after `nuxt prepare`, the full baseline suite above ran to completion.
- `pnpm deploy:check` passes for `agency-dashboard / main`.
- Production build is pending. No production deployment or authenticated grant /
  draft creation acceptance is claimed yet.

Local evidence: `/private/tmp/page-studio-production-focused.log`,
`/private/tmp/page-studio-production-full-tests.log`,
`/private/tmp/page-studio-production-baseline-tests.log`,
`/private/tmp/page-studio-production-functional-lint.log`,
`/private/tmp/page-studio-production-shared-lint.json`,
`/private/tmp/page-studio-baseline-shared-lint.json`.

## Client delivery remains open

Fantasy Limo client `0595e5aa-59b4-461e-b8ff-7fe529ca9667` still needs its explicit
internal development grant and saved draft through the normal authenticated
admin path. Paid terms, contact/portal owner, approved content, booking intake,
review URL and launch acceptance are not established by this increment.
