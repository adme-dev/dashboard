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

The guarded preview upload and deployed acceptance remain pending at this
checkpoint. Business Content/provisioner bindings, live AI session verification
configuration, commercial plans and Fantasy Limo client launch requirements
remain tracked in the foundation checklist and open-items ledger.
