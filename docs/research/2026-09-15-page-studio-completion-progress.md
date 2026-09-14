# Page Studio completion progress — 15 September 2026

This is the current checklist for domains/email and customer runtimes. Neither
workstream has full production acceptance. [Framer](2026-09-15-page-studio-framer-reference.md)
is an additional product reference; it does not replace the delivery objective.

## Verified production

Dashboard source `78bf3ddd24bef1e2f639243e9160257df68bc82f` is deployed to the
immutable `agency-dashboard` project as `e0bd000d-694e-402c-a5da-ce0d481d8172`.
PR556 fresh session revocation, PR557 domain verification and PR559 durable initial
attachment are included. Both required full CI runs passed before each merge.
The guarded release used a clean checkout of exact freshly fetched main.

Independent Cloudflare readback verified source, production service bindings,
environment, both database origins and unchanged private Worker versions. Their
public URLs, preview URLs and cron schedules remain off. Authenticated Domains
and QR navigation render without horizontal overflow. The Geist font asset still
matches SHA256 `9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608`.
Restricted browser DOM did not expose native font-load state. The latest SVG click
hit Chrome ERR_BLOCKED_BY_CLIENT; no bypass or new SVG200 acceptance is claimed.
Evidence: `.verification/production-services-78bf3ddd.json` and
`.verification/production-browser-78bf3ddd.json`.

## Domains and email

- [x] Correct domain ownership/TLS/DNS states; connected CNAME-chain verification
  and provider identity checks; no false activation after an attachment retry.
- [x] Durable initial attachment ownership and attempt receipts. Unknown provider
  acknowledgements do not cause blind duplicate creation.
- [x] Additive migrations418 and419 applied and independently read back on exact
  production `br-small-hall-a4qtwjgo` and staging `br-long-mountain-a4f73v10`,
  project `square-tooth-23821574`, database `neondb`. No settings or domain
  operations were inserted by the migrations.
- [ ] Integrate and release email preferences and customer portal domain controls.
  PR558 contains the combined candidate on current main78bf.
  Its combined build exceeded the fixed Pages raw budget by3215bytes. Email-only
  private Worker extraction still exceeded by2209; neither candidate deployed.
  Complete domain authority/provider/DNS/receipt operations and portal controls
  are now composed into that private management Worker and independently approved.
  The combined generation-v2 build passes raw25,465,097 /25,468,928, leaving3831
  bytes under the unchanged budget. The final full suite passes13770 tests (259 environment-gated skips).
  The previous service-count failure now requires the exact fifth staging binding.
  Worker strict types and55-file lint comparison pass with no new diagnostics;
  eight existing inventory-test lint diagnostics are unchanged. Independent
  real PostgreSQL email25 and domain51 cases also pass. No budget increase is allowed.
- [x] Local private management safeguards: exact environment/cache-disabled
  Hyperdrive, default fetch404, private RPC, strict request/result scope, no
  automatic write replay, per-request transaction cleanup. Compatibility is
  explicitly2026-07-15, matching the installed runtime. Relative generated types
  are identical across three checkout paths. Immutable deploy admission has31
  direct tests, alongside target/config and database lifecycle tests.
- [x] Local portal domain admin/viewer behavior and safe instruction projection.
  The post-buffer2KiB body check found in review is replaced with bounded streaming
  and invalid UTF-8 rejection. Domain closure has158 focused cases,49 actual
  PostgreSQL cases and9 built RPC/default404 cases at its reviewed snapshot.
  Earlier actual desktop/mobile Nuxt UI checks prove scrolling and modal fit.
- [ ] Deploy/verify the private management Worker in staging before production
  and before releasing its Pages service binding. No management Worker is live yet.
- [ ] Configure the customer-domain provider. Read-only Cloudflare inspection
  found no zone ID, hostname target or provider token on either Pages environment.
  Absence remains fail-closed; no provider provisioning is claimed.
- [ ] Enforce domain ownership/TLS freshness during release activation and public
  hostname resolution; implement durable detach with exact pointer revocation
  before provider deletion; accept apex/proxied DNS, cutover and rollback.
  The existing agency aggregate also labels domain rows `production` even when
  served from staging; derive this display label from the trusted environment
  during the hostname-authority slice. It is not evidence of production activation.
- [ ] Complete sender ownership/provider verification, forwarding, reliable outbox,
  suppression/events and actual controlled email delivery. Settings explicitly
  keep sending and forwarding disabled until those paths are accepted.

Required customer inputs remain unanswered: acceptance domain, current DNS/mailbox
provider and controlled test recipient. No customer DNS, mailbox, email or cutover
changes have occurred.

## Customer runtime reconciliation

Foundation current main is `1434d76c4705726e1af141184df4a7cc837fe5dc`.

- [x] Dependency recovery PR44 merged as `c01e9465`; provisioning engine PR45
  merged as `5786a0b9`, after full Ubuntu/Windows CI. Engine focused253 tests pass.
- [x] CI resource fix PR50 merged as `d3789c73` after full Ubuntu/Windows checks.
  Windows package tests now run with concurrency1 and the unchanged security
  suite separately. Assertions and timeouts are unchanged. Earlier Windows
  failures were test timeouts, not accepted product behavior.
- [x] PR51 merged as `1434d76c4705726e1af141184df4a7cc837fe5dc` after full
  Linux/Windows CI34880019556 and independent source reviews. It includes reviewed
  form contracts43, metadata retry47, prerequisites48 and the17-file executor host.
  All21 form and9 retry files were independently proven byte-identical;46 of47
  prerequisite paths match, with only two reviewed executor dependency links
  added to the lockfile. PR43/47/48 are closed as incorporated, preventing duplicate
  integration. The merged tree exactly equals reviewed executor head6eea5b5c.
  Local full build/types/lint/audit and2643 package/security assertions pass;
  both private dry runs pass. No runtime deployment has occurred.
- [ ] PR46 private coordinator is reconciled onto1434d76 as
  `93434bb12acc117d1b06ca10e3c419efd1a65b49`; executable/test/config files are
  unchanged and the six-line lockfile delta is reviewed. New full CI is running.
- [ ] The local executor workerd compatibility date still differs from deployment.
  Exact deployed-runtime compatibility is an explicit acceptance gate.
- [ ] Reconcile control-service contracts, deploy private services in order and
  prove fresh two-customer provisioning, upgrades, cleanup, metering/quotas and
  failure recovery. No runtime candidate above has been deployed.
  Read-only contract audit confirms the existing authorization and checkpoint
  endpoints match the recovered executor. A focused new-job fix is reviewed and composed into the dashboard candidate:
  current production omits `generationVersion: 2`, leaving normal jobs on
  the legacy generator. The candidate selects v2 for new jobs, with100 focused
  tests and10 actual reference/recovered template comparisons passing. Retained legacy retries must preserve their original
  identity. Complete runtime/router entrypoints and configurations, operational
  reconciliation, upgrade contracts and trusted usage/billing integration remain
  missing from current main; source primitives alone do not complete those paths.
- [ ] Actual Worker Loader execution has not been established. Workers for
  Platforms dispatch is a separate mechanism and must not be counted as that proof.

Forms CSS PR41, roadmap PR42 and other historical unmerged work remain accounted
for; do not merge an old branch wholesale. The root Dashboard working tree is dirty
with unrelated work and is never a release source.

## Fixture retirement and branch hygiene

- [x] Synthetic production run a3c7dd62 is retired: both clients, staff and portal
  users inactive, sites archived, entitlements cancelled, six saved sessions401,
  zero active fixture authority and both routes absent. Local credentials removed.
  Failed provisioning records and retained D1/Worker resources were not deleted;
  the unsuccessful seed run was not repeated.
- [x] Staging run705e is retired in database and provider configuration. Saved
  agency session401; sessions/magic links/active routes/sites/leads/editor sessions
  zero. Recovery-only canary removal passed22 tests and independent readback:
  version `a34550d0-fbfe-4ac4-87ea-026044eac0a5`, unchanged source/container,
  schedules,15 other bindings,21 domains and both original canaries. Both retired
  URLs no longer resolve. No stopped attachment or publication was resumed.
- [x] Owned completed Dashboard556/557/559 and Foundation44/45 local/remote branches
  and worktrees retired only after exact merged-tree proof. PR45 evidence preserved
  in `.verification/provisioning-engine-pr45/`;557/559 evidence likewise retained.
  No other contributor's branches or worktrees were deleted.

The QR list's duplicate Campaigns links remain a small separate UI backlog item.
Fantasy fleet/rates/content migration, original end-to-end AI form/booking journey,
self-service and billing acceptance remain in the broader ledger. This document and
Graph Wiki are updated locally; hosted Wiki synchronization is not claimed.
