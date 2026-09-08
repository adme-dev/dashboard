# Page Studio release readiness — 2026-09-08

## Pages size blocker resolved locally

The email marketing route already has `ssr: false` through `/agency/**`, but
Nuxt still compiled its five admin panels into the server bundle. Wrapping those
panels in `ClientOnly` removes that unused SSR dependency tree while retaining
their client rendering, tab state, APIs and existing components. The loading
fallback uses Nuxt UI's `USkeleton`.

Reference: https://nuxt.com/docs/4.x/api/components/client-only

| Measurement | Before | After |
| --- | ---: | ---: |
| Raw deployed Worker bytes | 25,549,364 | 25,045,349 |
| Gzip deployed Worker bytes | 6,635,341 | 6,580,439 |
| Raw headroom under unchanged 25,468,928-byte guard | -80,436 | 423,579 |
| Generated email SSR chunk, before postbuild compaction | 636,778 | 3,494 |

Verification: full `pnpm build` passed on Node 24.18.0; all eight tests across
the campaign, campaign-preflight and campaign-report component suites passed;
scoped ESLint and `pnpm deploy:check` passed. The complete modified page was
reviewed, including preserved panel conditions and component auto-imports.

Browser verification used the compiled client assets on a localhost fixture
server with synthetic, read-only API responses. Lists displayed the synthetic
list; Subscribers and Suppressions displayed their expected empty states;
Templates displayed the built-in catalogue; Campaigns displayed the disabled
sending state. All five tabs mounted. This verifies client rendering, not live
email delivery or authentication. Kimi's basic click emits only `click`; Reka
tabs select on `mousedown`, so the check dispatched that event to the observed
tab elements. No sending or customer-data writes were exercised.

## Database readiness

Read-only inspection found migration 415's table already present in the
database configured by the root `.env`, but absent in the verified isolated
Neon branch `staging/page-studio` (`br-long-mountain-a4f73v10`, project
`square-tooth-23821574`, database `neondb`). Applied the existing migration 415
to that staging branch. Readback confirms the table, seven constraints, three
indexes and zero proposal rows. No production migration was performed.

## Deployment evidence and remaining gates

Cloudflare's production deployment list currently identifies deployment
`1a61474f-11aa-41c1-9b54-a31ba0c32a73`, source `60f2171`. Local `origin/main`
is `b442ae430`; a branch comparison alone does not identify the deployed source.
This report does not claim a new production deployment.

Both guarded preview attempts passed the size check but failed uploading assets
at 252/920. Wrangler logs show `UND_ERR_CONNECT_TIMEOUT`, `ETIMEDOUT` and `EPIPE`;
the second attempt also used IPv4-first DNS ordering. Remote readback after the
retry still identifies preview deployment `54e83ed7-44ae-47f2-b4d6-765f0ef6e9c3`,
source `1384a3e`, and no deployment for `e3e4ac7`. No new preview or production
release was created. The retry's raw/gzip totals were 25,045,343 / 6,580,419 bytes.

The Dashboard branch is published in draft PR
https://github.com/adme-dev/dashboard/pull/519. Its first full CI run reported
13,086 passing tests, 27 skipped tests and three failures: two stale security
inventories and a Google Ads health fixture whose fixed date had aged past its
freshness threshold. Commit `c592c1c13` refreshes the reviewed inventories,
explicitly classifies portal identity and session-key configuration as hard
boundaries, and freezes the analytics test clock. Commit `727a641e0` also fixes
the proposal revision query to select the approval status it checks, with an
accepted-plan rejection regression. All 23 affected tests and scoped ESLint
pass locally. Build/CI evidence above is for the earlier bundle-fix commit;
fresh CI is required for these follow-ups.

Business Content/provisioner bindings, live AI session verification
configuration, commercial plans and Fantasy Limo client launch requirements
remain tracked in the foundation checklist and open-items ledger. Booking
bindings also need an explicit authenticated tenant/client/site scope contract
before general deployment: the current booking adapter accepts options or an
ID without carrying caller scope. This is a release prerequisite, not proof of
multi-tenant isolation.
