# Page Studio logout — verified staging release

17 September 2026. **Staging deployed and verified. Production promotion remains open.**

## Release

- Dashboard source: `397d11a013e806e4a78c8984f8773897a9e732e6`.
- Current main included: `a917386dde67f06921843fd6e3a1ed1b4b984c6f`.
- Target: `agency-dashboard`, branch `preview`.
- Deployment: `a5bed71a-fc84-4f9f-8ea4-eb6aaaf11ced`.
- URL: https://preview.agency-dashboard-6cm.pages.dev/agency/page-studio
- Production deployment remains `8798c363-6e9c-472a-a78f-47d8ce780ef4`.
- Private control and Studio Worker deployments/bindings and container version 15
  are unchanged from the [previous staging release](./2026-09-17-page-studio-session-authority-staging.md).

The [logout implementation](./2026-09-17-page-studio-logout-propagation.md) is now
active in staging. Migration 420 was already applied to the isolated staging
branch. No production migration or deployment ran. Source commits remain local;
no public security reproduction or PR was published.

## Bundle-size repair

The first clean release build exceeded the fixed size guard by 1,208 bytes.
The existing module-path compactor now assigns shorter filenames to modules
with more incoming ESM references. Equal counts retain deterministic path order.
It uses the same reference parser and rewrite behavior as before; application
code, exported names, minifier policy and size limits are unchanged.

An executable regression failed before the repair and passed after it. Tests
cover static re-exports, dynamic imports, query/hash suffixes, ordinary strings,
creation-order independence and repeat-run idempotence. A 2,761-module corpus
comparison preserved module bodies and reduced the actual existing artifact by
9,034 bytes; that comparison masks rewritten relative specifiers and is not a
standalone proof of graph identity. Import resolution is tested executably and
through the deployed application. Independent review found no actionable issues.

The guarded clean checkout passed `pnpm deploy:check` and `pnpm deploy:preview`.
Its release artifact is **25,461,102 / 25,468,928 raw bytes**, leaving **7,826 bytes**.
Gzip: 6,621,363 / 9,750,000 bytes. Headroom remains small; larger platform additions
need deliberate bundle reduction or server extraction rather than a higher limit.

## Acceptance and tests

- **1,122 regression tests passed**, including 55 build-tool/guard tests; 345
  opt-in tests skipped. Changed-file lint passed. Whole-repository typecheck
  retains exactly the same 913 diagnostics as main, with no additions/removals.
- The unchanged authentication implementation also retains its separately run
  125 PostgreSQL tests and 17 actual-source cross-repository scenarios from the
  preceding section. These were not rerun for a filename-only build-tool change.
- **30 live staging cases passed** using temporary synthetic agency/portal users:
  current access removal; logout denial; preservation of independent same-user
  logins; refusal to reissue from logged-out credentials; idempotent audit;
  logout before first launch; canonical revocation from legacy aliases; and both
  agency auth cookies revoked without denying a third login.
- Positive HTTP admission deliberately reaches `400 Workspace scope is required`
  after the live Studio → control gateway → Dashboard authority check. Denials
  return `403 SESSION_AUTHORITY_DENIED`; relaunch after logout returns 401.
  These requests do not create workspaces or invoke models.
- Authenticated browser launch separately opened the existing synthetic website
  in Studio with desktop/mobile previews, page tree and `Save status: waiting for
  changes`. No content edits or publication. Dashboard website navigation loads.
- QR Codes renders. The existing operator's Page Studio-only permissions still
  produce the expected QR API 403; a permitted synthetic account_manager received
  200 and an empty scoped list. No real user's role was changed.
- Test fixtures retired. Independent DB readback found zero active test grants,
  parent logins, portal sessions, sites, staff or client users. Temporary DB
  credential and clean release worktree removed; unmerged source branch retained.

## Remaining scope

R06d.3 logout linkage is staging verified. Open connections, in-flight jobs and
current authority at write commit remain open, as do generated-script origin
isolation, CPU containment, the full browser/expiry/cache matrix and production
promotion. R06 remains incomplete. Generated customer code stays disabled.

No new marketed feature or feature count changed in this release.

## Evidence

Root `.verification/page-studio-builder-rnd-20260917/`:
`bundle-path-red.log`, `bundle-path-green.log`, `bundle-path-lint.log`,
`bundle-path-corpus.json`, `logout-release-tests.log`,
`logout-release-typecheck-comparison.json`, `logout-release-deploy.log`,
`logout-release-before.json`, `logout-release-after.json`,
`logout-staging-acceptance.json`, `logout-release-cleanup.json`,
`logout-release-final-verification.json`.
